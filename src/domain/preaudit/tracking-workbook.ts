import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import {
  isSupplierTrackingApplicable,
  TRACKING_FIELD_BY_KEY,
  trackingDisplayValues,
  trackingFieldOwnership,
} from './tracking-fields';
import type { PreauditProject, TrackingFieldValue } from './types';

const MAIN_SHEET = 'OT前置特批跟踪合同';
const REJECTED_SHEET = 'EMT前置特批拒绝合同';
const DATA_START_ROW = 3;
const SYSTEM_PROJECT_ID_COLUMN = 'AN';

const COLUMN_FIELDS: Array<[string, string]> = [
  ['B', 'trackingStatus'],
  ['C', 'updatedAt'],
  ['D', 'sequenceNumber'],
  ['E', 'salesBu'],
  ['F', 'salesRegion'],
  ['G', 'salesManager'],
  ['H', 'projectName'],
  ['I', 'customerName'],
  ['J', 'endUserName'],
  ['K', 'specialApprovalItems'],
  ['L', 'financingSituation'],
  ['M', 'projectSummary'],
  ['N', 'currentIssues'],
  ['O', 'contractForm'],
  ['P', 'contractAmountCny'],
  ['Q', 'approvedGm1'],
  ['R', 'signingStatus'],
  ['S', 'signingDate'],
  ['T', 'projectCode'],
  ['U', 'paymentDistribution'],
  ['V', 'cumulativeCollection'],
  ['W', 'accountsReceivableAmount'],
  ['X', 'receivableName'],
  ['Y', 'receivableDate'],
  ['Z', 'expectedCollectionDate'],
  ['AA', 'collectionAnalysis'],
  ['AB', 'deliveryProjectStatus'],
  ['AC', 'currentMilestone'],
  ['AD', 'milestonePlannedCompletionDate'],
  ['AE', 'listingStage'],
  ['AF', 'deliveryAnalysis'],
  ['AG', 'procurementContract'],
  ['AH', 'procurementPaymentSchedule'],
  ['AI', 'cumulativePayment'],
  ['AJ', 'procurementAnalysis'],
  ['AK', 'businessUnitCommitments'],
  ['AL', 'commitmentProgress'],
  ['AM', 'projectLatestProgress'],
];

const DATE_FIELDS = new Set([
  'updatedAt',
  'signingDate',
  'receivableDate',
  'expectedCollectionDate',
  'milestonePlannedCompletionDate',
]);
const AMOUNT_FIELDS = new Set([
  'contractAmountCny',
  'cumulativeCollection',
  'accountsReceivableAmount',
  'cumulativePayment',
]);

export type TrackingImportMatchStatus =
  | 'matched'
  | 'unmatched'
  | 'ambiguous'
  | 'invalid'
  | 'stale';

export interface TrackingImportPreviewRow {
  rowNumber: number;
  matchStatus: TrackingImportMatchStatus;
  projectId?: string;
  candidateProjectIds: string[];
  effectiveDate?: string;
  values: Record<string, TrackingFieldValue | '#CLEAR'>;
  changes: Array<{ key: string; previous?: TrackingFieldValue; next: TrackingFieldValue | '#CLEAR' }>;
  errors: string[];
}

export interface TrackingImportPreview {
  rows: TrackingImportPreviewRow[];
  summary: Record<TrackingImportMatchStatus, number>;
}

export class TrackingWorkbookError extends Error {
  constructor(
    readonly code: 'TRACKING_SHEET_MISSING' | 'TRACKING_HEADER_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'TrackingWorkbookError';
  }
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s，,。；;：:（）()【】[\]《》<>_\-]+/g, '')
    .toLowerCase();
}

function displayValue(project: PreauditProject, answerKey: string): string {
  const value = project.answers[answerKey]?.value;
  return value === undefined ? '' : String(value);
}

function latestValues(project: PreauditProject): Record<string, TrackingFieldValue> {
  const snapshot = project.tracking?.snapshots.find(
    (candidate) => candidate.id === project.tracking?.currentSnapshotId,
  );
  return snapshot?.values ?? {};
}

function projectCodes(project: PreauditProject): string[] {
  const values = trackingDisplayValues(project);
  return [
    values.projectCode,
    displayValue(project, 'projectCode'),
    displayValue(project, 'opportunitySerialNumber'),
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function projectComposite(project: PreauditProject): string {
  const values = trackingDisplayValues(project);
  const projectName = values.projectName ?? displayValue(project, 'contractName');
  const customerName = values.customerName ?? displayValue(project, 'customerName');
  const salesManager = values.salesManager ?? (displayValue(project, 'salesManager') || project.salesName);
  return [projectName, customerName, salesManager].map(normalizeIdentity).join('|');
}

function isoDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll('/', '-');
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return undefined;
}

function cellValue(sheet: XLSX.WorkSheet, column: string, row: number): unknown {
  return sheet[`${column}${row}`]?.v;
}

function convertCell(
  key: string,
  raw: unknown,
  errors: string[],
): TrackingFieldValue | '#CLEAR' | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') return undefined;
    if (trimmed === '#CLEAR') return '#CLEAR';
  }
  if (DATE_FIELDS.has(key)) {
    const value = isoDate(raw);
    if (!value) errors.push(`${TRACKING_FIELD_BY_KEY.get(key)?.label ?? key}格式无效`);
    return value;
  }
  if (AMOUNT_FIELDS.has(key) || key === 'sequenceNumber') {
    const value = typeof raw === 'number' ? raw : Number(String(raw).replaceAll(',', '').trim());
    if (!Number.isFinite(value)) {
      errors.push(`${TRACKING_FIELD_BY_KEY.get(key)?.label ?? key}必须是数字`);
      return undefined;
    }
    return value;
  }
  if (key === 'approvedGm1') {
    const numeric = typeof raw === 'number' ? raw : Number(String(raw).replace('%', '').trim());
    const value = typeof raw === 'string' && raw.includes('%')
      ? numeric
      : numeric * 100;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push('线上审批 GM1 必须在 0% 到 100% 之间');
      return undefined;
    }
    return Number(value.toFixed(4));
  }
  if (key === 'trackingStatus') {
    const status = String(raw).trim();
    const mapped = status === '跟踪中'
      ? 'in_progress'
      : status === '跟踪结束' || status === '跟踪完毕/结束'
        ? 'completed'
        : status === '尚未开始跟踪'
          ? 'not_started'
          : undefined;
    if (!mapped) errors.push('项目跟踪状态选项无效');
    return mapped;
  }
  return typeof raw === 'boolean' || typeof raw === 'number' ? raw : String(raw).trim();
}

function matchProjects(
  sheet: XLSX.WorkSheet,
  row: number,
  projects: PreauditProject[],
): PreauditProject[] {
  const hiddenId = String(cellValue(sheet, SYSTEM_PROJECT_ID_COLUMN, row) ?? '').trim();
  if (hiddenId) {
    const exact = projects.find((project) => project.id === hiddenId);
    if (exact) return [exact];
  }
  const code = normalizeIdentity(cellValue(sheet, 'T', row));
  if (code) {
    const byCode = projects.filter((project) => projectCodes(project).some((candidate) => normalizeIdentity(candidate) === code));
    if (byCode.length) return byCode;
  }
  const composite = [
    cellValue(sheet, 'H', row),
    cellValue(sheet, 'I', row),
    cellValue(sheet, 'G', row),
  ].map(normalizeIdentity).join('|');
  if (composite !== '||') {
    return projects.filter((project) => projectComposite(project) === composite);
  }
  return [];
}

function validateHeaders(sheet: XLSX.WorkSheet): void {
  if (cellValue(sheet, 'B', 2) !== '项目跟踪状态' || cellValue(sheet, 'AM', 2) !== '项目最新进展') {
    throw new TrackingWorkbookError('TRACKING_HEADER_MISMATCH', '项目跟踪工作表表头不匹配');
  }
}

export function parseTrackingWorkbook(
  bytes: ArrayBuffer | Uint8Array,
  projects: PreauditProject[],
): TrackingImportPreview {
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, cellDates: true });
  const sheet = workbook.Sheets[MAIN_SHEET];
  if (!sheet) throw new TrackingWorkbookError('TRACKING_SHEET_MISSING', `工作簿缺少“${MAIN_SHEET}”`);
  validateHeaders(sheet);
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:AN2');
  const rows: TrackingImportPreviewRow[] = [];

  for (let row = DATA_START_ROW; row <= range.e.r + 1; row += 1) {
    const hasBusinessValue = ['G', 'H', 'I', 'T', SYSTEM_PROJECT_ID_COLUMN]
      .some((column) => String(cellValue(sheet, column, row) ?? '').trim());
    if (!hasBusinessValue) continue;
    const errors: string[] = [];
    const values: Record<string, TrackingFieldValue | '#CLEAR'> = {};
    for (const [column, key] of COLUMN_FIELDS) {
      const value = convertCell(key, cellValue(sheet, column, row), errors);
      const field = TRACKING_FIELD_BY_KEY.get(key);
      if (value !== undefined && field && trackingFieldOwnership(field) === 'snapshot') {
        values[key] = value;
      }
    }
    const effectiveDate = isoDate(cellValue(sheet, 'C', row));
    if (!effectiveDate) errors.push('更新时间格式无效');
    const matches = matchProjects(sheet, row, projects);
    const project = matches.length === 1 ? matches[0] : undefined;
    if (project && !isSupplierTrackingApplicable(project)) {
      const hasSupplierValues = Object.keys(values).some(
        (key) => TRACKING_FIELD_BY_KEY.get(key)?.section === 'procurement',
      );
      if (hasSupplierValues) errors.push('当前项目不涉及采购，不能导入供应商跟踪字段');
    }
    const currentValues = project ? latestValues(project) : {};
    const changes = Object.entries(values)
      .filter(([key, next]) => next === '#CLEAR' ? currentValues[key] !== null : currentValues[key] !== next)
      .map(([key, next]) => ({ key, previous: currentValues[key], next }));
    const latestDate = project?.tracking?.snapshots.find(
      (snapshot) => snapshot.id === project.tracking?.currentSnapshotId,
    )?.effectiveDate;
    const matchStatus: TrackingImportMatchStatus = errors.length
      ? 'invalid'
      : matches.length === 0
        ? 'unmatched'
        : matches.length > 1
          ? 'ambiguous'
          : latestDate && effectiveDate && effectiveDate < latestDate
            ? 'stale'
            : 'matched';
    rows.push({
      rowNumber: row,
      matchStatus,
      projectId: project?.id,
      candidateProjectIds: matches.map((match) => match.id),
      effectiveDate,
      values,
      changes,
      errors,
    });
  }

  const summary: Record<TrackingImportMatchStatus, number> = {
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    invalid: 0,
    stale: 0,
  };
  for (const row of rows) summary[row.matchStatus] += 1;
  return { rows, summary };
}

export const TRACKING_WORKBOOK_SHEETS = { main: MAIN_SHEET, rejected: REJECTED_SHEET };

interface TrackingExportOptions {
  templatePath?: string;
}

function sanitizeWorksheetXml(output: ArrayBuffer): ArrayBuffer {
  const archive = unzipSync(new Uint8Array(output));
  for (const [entry, bytes] of Object.entries(archive)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entry)) continue;
    const xml = strFromU8(bytes);
    const sanitized = xml.replace(/(<col\b[^>]*?)\slevel="[^"]*"/g, '$1');
    if (sanitized !== xml) archive[entry] = strToU8(sanitized);
  }
  return zipSync(archive, { level: 6 }).buffer as ArrayBuffer;
}

const MAIN_EXPORT_COLUMNS = new Map(COLUMN_FIELDS.map(([column, key]) => [key, column]));

function currentSnapshot(project: PreauditProject) {
  return project.tracking?.snapshots.find(
    (snapshot) => snapshot.id === project.tracking?.currentSnapshotId,
  );
}

function projectValue(project: PreauditProject, key: string): TrackingFieldValue | undefined {
  const values = trackingDisplayValues(project);
  if (values[key] !== undefined) return values[key];
  if (key === 'projectCode') return project.answers.opportunitySerialNumber?.value;
  return undefined;
}

function clearRangeContents(sheet: XLSX.WorkSheet, rangeAddress: string): void {
  const range = XLSX.utils.decode_range(rangeAddress);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (!cell) continue;
      const style = cell.s;
      sheet[address] = style ? { t: 'z', s: style } : { t: 'z' };
    }
  }
}

function writeCell(
  sheet: XLSX.WorkSheet,
  address: string,
  value: TrackingFieldValue | Date | undefined,
  numberFormat?: string,
): void {
  if (value === undefined || value === null || value === '') return;
  const existing = sheet[address];
  const cell: XLSX.CellObject = value instanceof Date
    ? { t: 'd', v: value, z: numberFormat ?? 'yyyy-mm-dd' }
    : typeof value === 'number'
      ? { t: 'n', v: value, z: numberFormat }
      : typeof value === 'boolean'
        ? { t: 'b', v: value }
        : { t: 's', v: value };
  if (existing?.s) cell.s = existing.s;
  sheet[address] = cell;
}

function dateForExport(value: TrackingFieldValue | undefined): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function trackingStatusLabel(project: PreauditProject): string {
  if (project.status === 'tracking_completed' || project.tracking?.status === 'completed') return '跟踪完毕/结束';
  if (project.tracking?.status === 'not_started') return '尚未开始跟踪';
  return '跟踪中';
}

function profitStatusLabel(value: TrackingFieldValue | undefined): string {
  return {
    achieved: '已达成',
    not_achieved: '未达成',
    at_risk: '存在风险',
    not_applicable: '不适用',
  }[String(value)] ?? '未填写';
}

function commitmentExportText(project: PreauditProject): string | undefined {
  const forecast = projectValue(project, 'currentForecastGm1');
  const profitStatus = projectValue(project, 'profitCommitmentStatus');
  const progress = projectValue(project, 'commitmentProgress');
  const parts = [
    typeof forecast === 'number' ? `当前预测GM1：${forecast}%` : undefined,
    profitStatus ? `利润承诺：${profitStatusLabel(profitStatus)}` : undefined,
    typeof progress === 'string' && progress.trim() ? progress.trim() : undefined,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join('\n') : undefined;
}

function ensureReference(sheet: XLSX.WorkSheet, reference: string): void {
  const current = XLSX.utils.decode_range(sheet['!ref'] ?? reference);
  const required = XLSX.utils.decode_range(reference);
  current.s.r = Math.min(current.s.r, required.s.r);
  current.s.c = Math.min(current.s.c, required.s.c);
  current.e.r = Math.max(current.e.r, required.e.r);
  current.e.c = Math.max(current.e.c, required.e.c);
  sheet['!ref'] = XLSX.utils.encode_range(current);
}

function writeMainProjects(sheet: XLSX.WorkSheet, projects: PreauditProject[]): void {
  clearRangeContents(sheet, 'B3:AN527');
  projects.forEach((project, index) => {
    const row = DATA_START_ROW + index;
    const snapshot = currentSnapshot(project);
    writeCell(sheet, `B${row}`, trackingStatusLabel(project));
    writeCell(sheet, `C${row}`, dateForExport(snapshot?.effectiveDate), 'yyyy-mm-dd');
    writeCell(sheet, `D${row}`, index + 1);
    for (const [key, column] of MAIN_EXPORT_COLUMNS) {
      if (['trackingStatus', 'updatedAt', 'sequenceNumber', 'commitmentProgress'].includes(key)) continue;
      const value = projectValue(project, key);
      if (DATE_FIELDS.has(key)) writeCell(sheet, `${column}${row}`, dateForExport(value), 'yyyy-mm-dd');
      else if (key === 'approvedGm1' && typeof value === 'number') writeCell(sheet, `${column}${row}`, value / 100, '0.00%');
      else if (AMOUNT_FIELDS.has(key)) writeCell(sheet, `${column}${row}`, value, '#,##0.00');
      else writeCell(sheet, `${column}${row}`, value);
    }
    writeCell(sheet, `AL${row}`, commitmentExportText(project));
    writeCell(sheet, `${SYSTEM_PROJECT_ID_COLUMN}${row}`, project.id);
  });
  const columns = sheet['!cols'] ?? [];
  while (columns.length <= 39) columns.push({});
  columns[39] = { ...(columns[39] ?? {}), hidden: true };
  sheet['!cols'] = columns;
  ensureReference(sheet, `A1:AN${Math.max(2, projects.length + 2)}`);
}

function writeRejectedProjects(sheet: XLSX.WorkSheet, projects: PreauditProject[]): void {
  clearRangeContents(sheet, 'A3:M200');
  projects.forEach((project, index) => {
    const row = DATA_START_ROW + index;
    const values: Array<TrackingFieldValue | Date | undefined> = [
      index + 1,
      projectValue(project, 'salesBu'),
      projectValue(project, 'projectName'),
      projectValue(project, 'customerName'),
      projectValue(project, 'endUserName'),
      projectValue(project, 'specialApprovalItems'),
      project.externalApproval?.comments,
      projectValue(project, 'contractAmountCny'),
      typeof projectValue(project, 'approvedGm1') === 'number'
        ? Number(projectValue(project, 'approvedGm1')) / 100
        : undefined,
      dateForExport(project.externalApproval?.decisionDate),
      project.answers.opportunitySerialNumber?.value,
      projectValue(project, 'salesManager') ?? project.salesName,
      project.externalApproval?.conditionalReason,
    ];
    values.forEach((value, column) => {
      const address = XLSX.utils.encode_cell({ r: row - 1, c: column });
      writeCell(sheet, address, value, column === 8 ? '0.00%' : column === 9 ? 'yyyy-mm-dd' : undefined);
    });
  });
  ensureReference(sheet, `A1:M${Math.max(2, projects.length + 2)}`);
}

function groupByBu(projects: PreauditProject[]): Map<string, PreauditProject[]> {
  const groups = new Map<string, PreauditProject[]>();
  for (const project of projects) {
    const bu = String(projectValue(project, 'salesBu') ?? '未填写');
    groups.set(bu, [...(groups.get(bu) ?? []), project]);
  }
  return groups;
}

function updateBuSummary(
  sheet: XLSX.WorkSheet,
  tracked: PreauditProject[],
  rejected: PreauditProject[],
): void {
  clearRangeContents(sheet, 'A3:E20');
  const bus = [...new Set([...groupByBu(tracked).keys(), ...groupByBu(rejected).keys()])].sort();
  bus.forEach((bu, index) => {
    const row = 3 + index;
    writeCell(sheet, `A${row}`, bu);
    writeCell(sheet, `B${row}`, tracked.filter((project) => String(projectValue(project, 'salesBu') ?? '未填写') === bu).length);
    writeCell(sheet, `D${row}`, rejected.filter((project) => String(projectValue(project, 'salesBu') ?? '未填写') === bu).length);
  });
  const totalRow = 3 + bus.length;
  writeCell(sheet, `A${totalRow}`, '汇总');
  writeCell(sheet, `B${totalRow}`, tracked.length);
  writeCell(sheet, `D${totalRow}`, rejected.length);
}

function updateRiskSummary(sheet: XLSX.WorkSheet, projects: PreauditProject[]): void {
  clearRangeContents(sheet, 'B3:I20');
  [...groupByBu(projects)].sort(([left], [right]) => left.localeCompare(right)).forEach(([bu, group], index) => {
    const row = 3 + index;
    const amount = group.reduce((sum, project) => sum + Number(projectValue(project, 'contractAmountCny') ?? 0), 0);
    const receivableProjects = group.filter((project) => Number(projectValue(project, 'accountsReceivableAmount') ?? 0) > 0);
    const receivable = receivableProjects.reduce(
      (sum, project) => sum + Number(projectValue(project, 'accountsReceivableAmount') ?? 0),
      0,
    );
    const deliveryIssues = group.filter((project) => {
      const issue = projectValue(project, 'currentIssues');
      return typeof issue === 'string' && issue.trim() && issue.trim() !== '无';
    });
    writeCell(sheet, `B${row}`, bu);
    writeCell(sheet, `C${row}`, amount, '#,##0.00');
    writeCell(sheet, `D${row}`, group.length);
    writeCell(sheet, `E${row}`, receivable, '#,##0.00');
    writeCell(sheet, `F${row}`, receivableProjects.length);
    writeCell(
      sheet,
      `G${row}`,
      deliveryIssues.reduce((sum, project) => sum + Number(projectValue(project, 'contractAmountCny') ?? 0), 0),
      '#,##0.00',
    );
    writeCell(sheet, `H${row}`, deliveryIssues.length);
    writeCell(
      sheet,
      `I${row}`,
      deliveryIssues.map((project) => `${projectValue(project, 'projectName') ?? project.id}：${projectValue(project, 'currentIssues')}`).join('\n'),
    );
  });
}

export async function exportTrackingWorkbook(
  projects: PreauditProject[],
  options: TrackingExportOptions = {},
): Promise<ArrayBuffer> {
  const templatePath = options.templatePath
    ?? process.env.PREAUDIT_TRACKING_TEMPLATE_PATH
    ?? path.resolve('data', 'templates', 'project-tracking-2026.xlsx');
  const source = await readFile(/* turbopackIgnore: true */ templatePath);
  const workbook = XLSX.read(source, {
    type: 'buffer',
    cellStyles: true,
    cellDates: true,
    cellNF: true,
    cellFormula: true,
  });
  const mainSheet = workbook.Sheets[MAIN_SHEET];
  const rejectedSheet = workbook.Sheets[REJECTED_SHEET];
  if (!mainSheet || !rejectedSheet) {
    throw new TrackingWorkbookError('TRACKING_SHEET_MISSING', '项目跟踪模板缺少主表或拒绝合同表');
  }
  validateHeaders(mainSheet);
  const tracked = projects.filter((project) => ['tracking', 'tracking_completed'].includes(project.status) && project.tracking);
  const rejected = projects.filter((project) => project.status === 'rejected');
  writeMainProjects(mainSheet, tracked);
  writeRejectedProjects(rejectedSheet, rejected);
  const buSheet = workbook.Sheets.Sheet1;
  if (buSheet) updateBuSummary(buSheet, tracked, rejected);
  const riskSheet = workbook.Sheets['项目预警风险汇总'];
  if (riskSheet) updateRiskSummary(riskSheet, tracked);
  const output = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    cellStyles: true,
    compression: true,
  }) as ArrayBuffer;
  return sanitizeWorksheetXml(output);
}

export function createTrackingExportFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `前置特批项目跟踪汇总-${stamp}.xlsx`;
}
