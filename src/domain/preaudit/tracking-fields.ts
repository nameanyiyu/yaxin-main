import type { FieldType, PreauditProject, TrackingFieldValue } from './types';

export interface TrackingFieldDefinition {
  key: string;
  label: string;
  section: 'basic' | 'overview' | 'signing' | 'collection' | 'delivery' | 'procurement' | 'feedback';
  type: FieldType | 'enum' | 'textarea';
  systemControlled?: boolean;
  ownership?: 'derived' | 'snapshot';
  options?: Array<{ value: string; label: string }>;
}

export const TRACKING_FIELDS: TrackingFieldDefinition[] = [
  { key: 'trackingStatus', label: '项目跟踪状态', section: 'basic', type: 'enum', systemControlled: true },
  { key: 'updatedAt', label: '更新时间', section: 'basic', type: 'date', systemControlled: true },
  { key: 'sequenceNumber', label: '序号', section: 'basic', type: 'number', systemControlled: true },
  { key: 'salesBu', label: '销售BU', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'salesRegion', label: '销售区域', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'salesManager', label: '销售经理', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'projectName', label: '项目名称', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'customerName', label: '签约客户', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'endUserName', label: '最终用户（如有）', section: 'basic', type: 'text', ownership: 'derived' },
  { key: 'specialApprovalItems', label: '特批事项', section: 'overview', type: 'textarea', ownership: 'derived' },
  { key: 'financingSituation', label: '垫资情况', section: 'overview', type: 'textarea', ownership: 'derived' },
  { key: 'projectSummary', label: '项目综合评述', section: 'overview', type: 'textarea', ownership: 'derived' },
  { key: 'currentIssues', label: '项目当前问题', section: 'overview', type: 'textarea' },
  { key: 'contractForm', label: '合同形式', section: 'signing', type: 'text' },
  { key: 'contractAmountCny', label: '签约合同金额(CNY)', section: 'signing', type: 'amount', ownership: 'derived' },
  { key: 'approvedGm1', label: '线上审批 GM1', section: 'signing', type: 'percentage', ownership: 'derived' },
  { key: 'signingStatus', label: '签约状态', section: 'signing', type: 'text' },
  { key: 'signingDate', label: '大签日期', section: 'signing', type: 'date' },
  { key: 'projectCode', label: '项目代码', section: 'signing', type: 'text' },
  { key: 'paymentDistribution', label: '款项分布', section: 'collection', type: 'textarea' },
  { key: 'cumulativeCollection', label: '累计到款', section: 'collection', type: 'amount' },
  { key: 'accountsReceivableAmount', label: '应收金额', section: 'collection', type: 'amount' },
  { key: 'receivableName', label: '应收款款项名称', section: 'collection', type: 'text' },
  { key: 'receivableDate', label: '应收日期', section: 'collection', type: 'date' },
  { key: 'expectedCollectionDate', label: '应收款（如有）测收日期', section: 'collection', type: 'date' },
  { key: 'collectionAnalysis', label: '回款分析说明', section: 'collection', type: 'textarea' },
  { key: 'deliveryProjectStatus', label: '项目状态', section: 'delivery', type: 'text' },
  { key: 'currentMilestone', label: '当前里程碑阶段', section: 'delivery', type: 'text' },
  { key: 'milestonePlannedCompletionDate', label: '当前里程碑计划完成时间', section: 'delivery', type: 'date' },
  { key: 'listingStage', label: '挂牌阶段', section: 'delivery', type: 'text' },
  { key: 'deliveryAnalysis', label: '交付分析说明', section: 'delivery', type: 'textarea' },
  { key: 'procurementContract', label: '采购合同', section: 'procurement', type: 'text' },
  { key: 'procurementPaymentSchedule', label: '采购合同付款节奏', section: 'procurement', type: 'textarea' },
  { key: 'cumulativePayment', label: '累计已付款', section: 'procurement', type: 'amount' },
  { key: 'procurementAnalysis', label: '采购分析说明', section: 'procurement', type: 'textarea' },
  { key: 'businessUnitCommitments', label: '事业部承诺条款', section: 'feedback', type: 'textarea', ownership: 'derived' },
  { key: 'commitmentProgress', label: '承诺条款达成进展', section: 'feedback', type: 'textarea' },
  { key: 'projectLatestProgress', label: '项目最新进展', section: 'feedback', type: 'textarea' },
  { key: 'currentForecastGm1', label: '当前预测 GM1', section: 'feedback', type: 'percentage' },
  {
    key: 'profitCommitmentStatus',
    label: '利润承诺是否达成',
    section: 'feedback',
    type: 'enum',
    options: [
      { value: 'achieved', label: '已达成' },
      { value: 'not_achieved', label: '未达成' },
      { value: 'at_risk', label: '存在风险' },
      { value: 'not_applicable', label: '不适用' },
    ],
  },
];

export const TRACKING_FIELD_BY_KEY = new Map(TRACKING_FIELDS.map((field) => [field.key, field]));

function answer(project: PreauditProject, key: string): TrackingFieldValue | undefined {
  return project.answers[key]?.value;
}

export function trackingFieldOwnership(field: TrackingFieldDefinition): 'system' | 'derived' | 'snapshot' {
  if (field.systemControlled) return 'system';
  return field.ownership ?? 'snapshot';
}

function financingSummary(project: PreauditProject): string | undefined {
  const overview = answer(project, 'financingOverview');
  if (typeof overview === 'string' && overview.trim()) return overview.trim();
  const legacyFinancing = answer(project, 'hasFinancing');
  const hasNewFinancingEvidence = answer(project, 'hasDirectFinancing') !== undefined || answer(project, 'hasPotentialFinancing') !== undefined;
  const hasFinancing = typeof legacyFinancing === 'boolean'
    ? legacyFinancing
    : hasNewFinancingEvidence
      ? answer(project, 'hasDirectFinancing') === true || answer(project, 'hasPotentialFinancing') === true
      : undefined;
  if (hasFinancing === false) return '未涉及垫资';
  if (hasFinancing !== true) return undefined;
  const parts: string[] = [];
  const directAmount = answer(project, 'directFinancingAmount');
  const directMonths = answer(project, 'directFinancingMonths');
  if (typeof directAmount === 'number') {
    parts.push(`直接垫资 ${directAmount} 元${typeof directMonths === 'number' ? `，期限 ${directMonths} 个月` : ''}`);
  }
  const potentialAmount = answer(project, 'potentialFinancingAmount');
  if (typeof potentialAmount === 'number') parts.push(`潜在垫资 ${potentialAmount} 元`);
  if (answer(project, 'isAisBusiness') === true) parts.push('AIS 业务：需跟进公司决议/管理意见');
  return parts.length ? parts.join('；') : undefined;
}

function riskSummary(project: PreauditProject): string | undefined {
  const triggered = project.risks.filter((risk) => risk.triggered).map((risk) => risk.title);
  const missing = project.risks.filter((risk) => risk.missingKeys.length > 0).map((risk) => `${risk.title}（待补充）`);
  const parts = [...triggered, ...missing];
  return parts.length ? parts.join('；') : '当前未命中已配置风险，继续按月核验';
}

export function trackingDerivedValues(project: PreauditProject): Record<string, TrackingFieldValue> {
  const defaults: Record<string, TrackingFieldValue | undefined> = {
    salesBu: answer(project, 'salesBu'),
    salesRegion: answer(project, 'salesRegion'),
    salesManager: answer(project, 'salesManager') ?? project.salesName,
    projectName: answer(project, 'contractName'),
    customerName: answer(project, 'customerName'),
    endUserName: answer(project, 'endUserName'),
    specialApprovalItems: project.templateVersion === '2026-08'
      ? [project.externalApproval?.specialApprovalItems, riskSummary(project)].filter(Boolean).join('；') || undefined
      : project.externalApproval?.specialApprovalItems,
    financingSituation: financingSummary(project),
    projectSummary: project.templateVersion === '2026-08'
      ? [answer(project, 'salesBg'), project.narratives.projectOverview].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join('｜') || undefined
      : project.narratives.projectOverview,
    contractAmountCny: answer(project, 'contractAmountCny'),
    approvedGm1: answer(project, 'gm1'),
    businessUnitCommitments: project.narratives.commitments,
  };
  return Object.fromEntries(
    Object.entries(defaults).filter((entry): entry is [string, TrackingFieldValue] => entry[1] !== undefined),
  );
}

export function trackingDefaults(project: PreauditProject): Record<string, TrackingFieldValue> {
  return trackingDerivedValues(project);
}

export function isSupplierTrackingApplicable(project: PreauditProject): boolean {
  return answer(project, 'hasProcurement') === true
    || project.risks.some((risk) => risk.triggered && risk.category === 'procurement');
}

export function trackingDisplayValues(project: PreauditProject): Record<string, TrackingFieldValue> {
  const current = project.tracking?.snapshots.find(
    (snapshot) => snapshot.id === project.tracking?.currentSnapshotId,
  );
  const snapshotValues = { ...(current?.values ?? {}) };
  if (!isSupplierTrackingApplicable(project)) {
    for (const field of TRACKING_FIELDS) {
      if (field.section === 'procurement') delete snapshotValues[field.key];
    }
  }
  return {
    ...snapshotValues,
    ...trackingDerivedValues(project),
  };
}
