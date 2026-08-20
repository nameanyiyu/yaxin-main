import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { PREAUDIT_TEMPLATE_2025_11 } from './template-2025-11';
import { riskControlLevelLabel } from './risk-level';
import type { FieldValue, PreauditProject, RiskFinding } from './types';

export class ExcelTemplateError extends Error {
  constructor(
    readonly code: 'TEMPLATE_MISMATCH' | 'TEMPLATE_SHEET_MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'ExcelTemplateError';
  }
}

interface ExportOptions {
  templatePath?: string;
  templateVersion?: string;
}

const RISK_RULE_BY_CELL_KEY: Record<string, string> = {
  customerCredit: 'CUSTOMER_CREDIT',
  contractChain: 'CONTRACT_CHAIN',
  paymentTerms: 'PAYMENT_TERMS',
  projectMargin: 'PROJECT_MARGIN',
  pureProcurement: 'PURE_PROCUREMENT',
  supplierCredit: 'SUPPLIER_CREDIT',
  procurementPayment: 'PROCUREMENT_PAYMENT',
  subcontracting: 'SUBCONTRACTING',
};

function value(project: PreauditProject, key: string): FieldValue | undefined {
  return project.answers[key]?.value;
}

function display(valueToDisplay: FieldValue | undefined): string {
  if (valueToDisplay === undefined) return '未填写';
  if (typeof valueToDisplay === 'boolean') return valueToDisplay ? '是' : '否';
  return String(valueToDisplay);
}

function riskText(finding: RiskFinding | undefined): string {
  if (!finding) return '不涉及｜未触发\n命中原因：项目不涉及该类风险。\n管控建议：无。';
  if (finding.missingKeys.length) {
    return `待补充｜${riskControlLevelLabel(finding)}\n缺失信息：${finding.missingKeys.join('、')}\n管控建议：${finding.followUpQuestions.join(' ')}`;
  }
  if (!finding.triggered) {
    return `不涉及｜未触发\n判断说明：${finding.reason}\n管控建议：${finding.impact}`;
  }
  return `涉及｜${riskControlLevelLabel(finding)}\n命中原因：${finding.reason}\n管控建议：${finding.impact}`;
}

function validateWorkbook(workbook: XLSX.WorkBook): { sheet: XLSX.WorkSheet; sheetName: string } {
  const sheetName = workbook.SheetNames.find(
    (candidate) => candidate.trim() === PREAUDIT_TEMPLATE_2025_11.sheetName,
  );
  if (!sheetName) {
    throw new ExcelTemplateError('TEMPLATE_SHEET_MISSING', '工作簿中未找到 2025-11 固定模板工作表');
  }
  const sheet = workbook.Sheets[sheetName];
  for (const [address, expected] of Object.entries(PREAUDIT_TEMPLATE_2025_11.anchors)) {
    if (sheet[address]?.v !== expected) {
      throw new ExcelTemplateError('TEMPLATE_MISMATCH', `模板锚点 ${address} 不匹配`);
    }
  }
  return { sheet, sheetName };
}

export function validateTemplateWorkbookBytes(bytes: ArrayBuffer | Uint8Array): void {
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
  validateWorkbook(workbook);
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function replaceCellWithInlineString(sheetXml: string, address: string, text: string): string {
  const pattern = new RegExp(
    `<c\\b([^>]*\\br="${address}"[^>]*)/>|<c\\b([^>]*\\br="${address}"[^>]*)>.*?</c>`,
    's',
  );
  if (!pattern.test(sheetXml)) {
    throw new ExcelTemplateError('TEMPLATE_MISMATCH', `模板中缺少目标单元格 ${address}`);
  }
  return sheetXml.replace(pattern, (_cell, selfClosingAttributes: string, fullCellAttributes: string) => {
    const attributes = selfClosingAttributes ?? fullCellAttributes;
    const cleanAttributes = attributes.replace(/\s+t="[^"]*"/g, '').replace(/\/\s*$/, '');
    return `<c${cleanAttributes} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  });
}

export async function exportPreauditWorkbook(
  project: PreauditProject,
  options: ExportOptions = {},
): Promise<ArrayBuffer> {
  const expectedVersion = options.templateVersion ?? PREAUDIT_TEMPLATE_2025_11.version;
  if (project.templateVersion !== expectedVersion) {
    throw new ExcelTemplateError('TEMPLATE_MISMATCH', '项目模板版本与固定模板不一致');
  }
  const templatePath =
    options.templatePath ?? path.resolve('data', 'templates', PREAUDIT_TEMPLATE_2025_11.fileName);
  const source = await readFile(/* turbopackIgnore: true */ templatePath);
  const workbook = XLSX.read(source, { type: 'buffer', cellStyles: true });
  validateWorkbook(workbook);
  const replacements = new Map<string, string>();

  replacements.set(
    'B4',
    [
      `合同名称：${display(value(project, 'contractName'))}`,
      `合同总额（CNY）：${display(value(project, 'contractAmountCny'))}`,
      `合同利润率（GM1）：${display(value(project, 'gm1'))}%`,
    ].join('\n'),
  );
  replacements.set(
    'E4',
    [
      `签约客户全称（评级）：${display(value(project, 'customerName'))}（${display(value(project, 'customerRating'))}）`,
      `最终用户全称：${display(value(project, 'endUserName'))}`,
      `供应商全称（评级）：${display(value(project, 'supplierName'))}（${display(value(project, 'supplierRating'))}）`,
    ].join('\n'),
  );
  replacements.set(
    'G4',
    [
      `销售BU：${display(value(project, 'salesBu'))}`,
      `销售区域：${display(value(project, 'salesRegion'))}`,
      `销售经理：${display(value(project, 'salesManager'))}`,
      `商机流水号：${display(value(project, 'opportunitySerialNumber'))}`,
    ].join('\n'),
  );

  for (const [cellKey, address] of Object.entries(PREAUDIT_TEMPLATE_2025_11.riskCells)) {
    const finding = project.risks.find((candidate) => candidate.ruleId === RISK_RULE_BY_CELL_KEY[cellKey]);
    replacements.set(address, riskText(finding));
  }

  for (const field of PREAUDIT_TEMPLATE_2025_11.fields) {
    const fieldValue = value(project, field.key);
    if (fieldValue === undefined) continue;
    for (const address of field.targetCells) {
      if (/^E(?:2[1-9]|30|3[3-5]|3[8-9]|40|4[3-8])$/.test(address)) {
        replacements.set(address, display(fieldValue));
      }
    }
  }

  if (project.review) {
    replacements.set(
      'C49',
      `${project.review.comments}\n复核人：${project.review.reviewerName}｜复核时间：${project.review.reviewedAt}`,
    );
  }

  const archive = unzipSync(new Uint8Array(source));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetBytes = archive[sheetPath];
  if (!sheetBytes) {
    throw new ExcelTemplateError('TEMPLATE_SHEET_MISSING', '固定模板缺少工作表 XML');
  }
  let sheetXml = strFromU8(sheetBytes);
  for (const [address, text] of replacements) {
    sheetXml = replaceCellWithInlineString(sheetXml, address, text);
  }
  archive[sheetPath] = strToU8(sheetXml);
  const output = zipSync(archive, { level: 6 });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

export function createExportFileName(project: PreauditProject): string {
  const contractName = display(value(project, 'contractName'))
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 60);
  return `${contractName || project.id}-域外合同前置审批表.xlsx`;
}
