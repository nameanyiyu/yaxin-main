import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { exportPreauditWorkbook } from '../excel-adapter';
import { evaluateRisks } from '../risk-engine';
import type { FieldValue, PreauditProject } from '../types';

const templatePath = path.join(process.cwd(), 'data', 'templates', 'preaudit-2025-11.xlsx');
const tempDirectories: string[] = [];

function projectFixture(): PreauditProject {
  const now = '2026-07-22T00:00:00.000Z';
  const values: Record<string, FieldValue> = {
    contractName: '测试合同',
    contractAmountCny: 8_000_000,
    gm1: 5,
    customerName: '测试客户有限公司',
    customerRating: 'A',
    endUserName: '最终用户有限公司',
    supplierName: '测试供应商有限公司',
    supplierRating: 'B',
    salesBu: '政企 BU',
    salesRegion: '华东区',
    salesManager: '张三',
    opportunitySource: '展会商机，已建立客户关系',
    projectBackground: '项目已立项并获得政策支持',
    contractChainProgress: '最终用户直签，合同待审批',
    fundingStatus: '客户自筹，资金已落实',
    commercialTerms: '里程碑付款，验收后支付尾款',
    amountMarginRecognition: '合同额 800 万，GM1 为 5%',
    procurementOverview: '采购服务器及实施服务',
    supplierOverview: '供应商具备交付资质',
    procurementTerms: '按交付里程碑付款',
    financingOverview: '不存在垫资',
    strategicAlignment: '符合政企业务战略',
    productCapability: '使用公司自有平台',
    projectContinuity: '预计形成后续扩容',
    contractRiskControl: '完成法务条款复核',
    deliveryRiskControl: '设置里程碑验收',
    collectionRiskControl: '回款节点与交付挂钩',
    collectionCommitment: '2026-12-31 前完成全部回款',
    deliveryCommitment: '按期保质交付',
    marginCommitment: '确保利润不再下降',
    supplierCommitment: '完成供应商准入复核',
    newOpportunityCommitment: '跟进后续扩容商机',
    otherCommitment: '无',
  };
  return {
    id: 'project-1',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status: 'reviewed',
    answers: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { value, source: 'sales', updatedAt: now }]),
    ),
    messages: [],
    risks: evaluateRisks(values),
    narratives: {},
    review: { reviewerName: '李复核', comments: '同意进入人工审批', reviewedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('exportPreauditWorkbook', () => {
  it('fills the original workbook while preserving anchors, comments, and merges', async () => {
    const sourceBefore = await readFile(templatePath);
    const sourceWorkbook = XLSX.read(sourceBefore, { type: 'buffer', cellStyles: true });
    const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
    const exported = await exportPreauditWorkbook(projectFixture(), { templatePath });
    const workbook = XLSX.read(Buffer.from(exported), { type: 'buffer', cellStyles: true });
    const sheetName = workbook.SheetNames.find((name) => name.trim() === '域外合同前置审批表-2025年11月启用');
    expect(sheetName).toBeDefined();
    const sheet = workbook.Sheets[sheetName!];

    expect(sheet.B2.v).toBe('域外合同前置特批审批表');
    expect(sheet.B2.s).toEqual(sourceSheet.B2.s);
    expect(sheet.B4.v).toContain('合同名称：测试合同');
    expect(sheet.B4.s).toEqual(sourceSheet.B4.s);
    expect(sheet.G11.v).toContain('涉及');
    expect(sheet.E21.v).toBe('展会商机，已建立客户关系');
    expect(sheet.E43.v).toBe('2026-12-31 前完成全部回款');
    expect(sheet.B49.v).toBe('后台部门建议');
    expect(sheet.C49.v).toContain('同意进入人工审批');
    expect(sheet['!merges']?.map((range) => XLSX.utils.encode_range(range))).toContain('B2:H2');
    expect(sheet.D21.c?.[0]?.t).toContain('商机来源');
    expect(sha256(await readFile(templatePath))).toBe(sha256(sourceBefore));
  });

  it('rejects a workbook whose fixed-template anchor was changed', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-excel-'));
    tempDirectories.push(directory);
    const invalidPath = path.join(directory, 'invalid.xlsx');
    const workbook = XLSX.read(await readFile(templatePath), { type: 'buffer', cellStyles: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    sheet.B2.v = '错误模板';
    await writeFile(invalidPath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    await expect(exportPreauditWorkbook(projectFixture(), { templatePath: invalidPath })).rejects.toMatchObject({
      code: 'TEMPLATE_MISMATCH',
    });
  });
});
