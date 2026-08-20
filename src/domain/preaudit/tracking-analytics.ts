import { resolveOrganization, type OrganizationNode } from './organization-config';
import type {
  PreauditProject,
  ProjectStatus,
  ProjectTrackingSnapshot,
  TrackingFieldValue,
} from './types';

const OT_STATUSES = new Set<ProjectStatus>([
  'pending_external_decision',
  'conditional_admission',
  'tracking',
  'rejected',
  'tracking_completed',
]);

export interface AnalyticsFilters {
  bgId?: string;
  buId?: string;
  regionId?: string;
  salesName?: string;
  status?: 'tracking' | 'tracking_completed' | 'not_entered';
  from?: string;
  to?: string;
}

export interface TrackingAnalyticsWarning {
  projectId: string;
  projectName: string;
  salesName: string;
  bgName: string;
  buName: string;
  ruleId:
    | 'HUMAN_BREACHED'
    | 'HUMAN_AT_RISK'
    | 'COLLECTION_REACHED_CONTRACT'
    | 'FORECAST_GM1_BELOW_APPROVED'
    | 'RECEIVABLE_OVERDUE'
    | 'MILESTONE_OVERDUE';
  severity: 'medium' | 'high';
  reason: string;
  evidence: Record<string, TrackingFieldValue>;
  latestTrackingDate?: string;
}

export interface AnalyticsGroup {
  id: string;
  label: string;
  kind: 'bg' | 'bu' | 'sales' | 'project';
  projectId?: string;
  otTotal: number;
  tracking: number;
  completed: number;
  commitmentNotAchieved: number;
  atRisk: number;
  suggestedCompletion: number;
}

export interface TrackingAnalyticsResult {
  metrics: {
    otTotal: number;
    enteredExecution: number;
    tracking: number;
    completed: number;
    notEnteredExecution: number;
    suggestedCompletion: number;
  };
  ratios: {
    completed: number | null;
    tracking: number | null;
    commitmentAchieved: number | null;
  };
  completedDistribution: {
    achieved: number;
    notAchieved: number;
    pendingEntry: number;
  };
  trackingDistribution: {
    normal: number;
    breached: number;
    atRisk: number;
    unmaintained: number;
  };
  groupKind: AnalyticsGroup['kind'];
  groups: AnalyticsGroup[];
  warnings: TrackingAnalyticsWarning[];
  projects: Array<{
    id: string;
    projectName: string;
    salesName: string;
    bgName: string;
    buName: string;
    regionName: string;
    status: ProjectStatus;
  }>;
}

interface ClassifiedProject {
  project: PreauditProject;
  projectName: string;
  bg?: OrganizationNode;
  bu?: OrganizationNode;
  region?: OrganizationNode;
  bgName: string;
  buName: string;
  regionName: string;
  latest?: ProjectTrackingSnapshot;
  suggestedCompletion: boolean;
}

function answerString(project: PreauditProject, key: string): string {
  const value = project.answers[key]?.value;
  return typeof value === 'string' ? value.trim() : '';
}

function answerNumber(project: PreauditProject, key: string): number | undefined {
  const value = project.answers[key]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function snapshotNumber(
  snapshot: ProjectTrackingSnapshot | undefined,
  key: string,
): number | undefined {
  const value = snapshot?.values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function snapshotString(
  snapshot: ProjectTrackingSnapshot | undefined,
  key: string,
): string | undefined {
  const value = snapshot?.values[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function latestSnapshot(project: PreauditProject): ProjectTrackingSnapshot | undefined {
  return project.tracking?.snapshots.find(
    (snapshot) => snapshot.id === project.tracking?.currentSnapshotId,
  ) ?? project.tracking?.snapshots.toSorted((left, right) =>
    right.effectiveDate.localeCompare(left.effectiveDate)
      || right.createdAt.localeCompare(left.createdAt))[0];
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function shanghaiDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dateInRange(project: PreauditProject, filters: AnalyticsFilters): boolean {
  const projectDate = (project.externalApproval?.recordedAt ?? project.updatedAt).slice(0, 10);
  return (!filters.from || projectDate >= filters.from)
    && (!filters.to || projectDate <= filters.to);
}

function classifyOrganization(
  project: PreauditProject,
  nodes: OrganizationNode[],
): Pick<ClassifiedProject, 'bg' | 'bu' | 'region' | 'bgName' | 'buName' | 'regionName'> {
  const buName = answerString(project, 'salesBu');
  const regionName = answerString(project, 'salesRegion');
  const resolved = resolveOrganization(nodes, buName, regionName)
    ?? resolveOrganization(nodes, buName);
  const savedBgName = answerString(project, 'salesBg');
  if (resolved) {
    const region = regionName
      ? nodes.find((node) =>
        node.type === 'region'
          && node.parentId === resolved.bu.id
          && node.name.toLocaleLowerCase('zh-CN') === regionName.toLocaleLowerCase('zh-CN'))
      : undefined;
    return {
      bg: resolved.bg,
      bu: resolved.bu,
      region,
      bgName: savedBgName || resolved.bg.name,
      buName: buName || resolved.bu.name,
      regionName: regionName || '未填写',
    };
  }
  return {
    bgName: savedBgName || '待配置',
    buName: buName || '待配置',
    regionName: regionName || '待配置',
  };
}

function isSuggestedCompletion(item: ClassifiedProject): boolean {
  if (item.project.status !== 'tracking') return false;
  const contract = answerNumber(item.project, 'contractAmountCny');
  const collection = snapshotNumber(item.latest, 'cumulativeCollection');
  return contract !== undefined && contract > 0 && collection !== undefined && collection >= contract;
}

function matchesFilters(item: ClassifiedProject, filters: AnalyticsFilters): boolean {
  if (filters.bgId && item.bg?.id !== filters.bgId) return false;
  if (filters.buId && item.bu?.id !== filters.buId) return false;
  if (filters.regionId && item.region?.id !== filters.regionId) return false;
  if (filters.salesName && item.project.salesName !== filters.salesName) return false;
  if (filters.status === 'tracking' && item.project.status !== 'tracking') return false;
  if (filters.status === 'tracking_completed' && item.project.status !== 'tracking_completed') return false;
  if (filters.status === 'not_entered' && ['tracking', 'tracking_completed'].includes(item.project.status)) return false;
  return true;
}

function warning(
  item: ClassifiedProject,
  ruleId: TrackingAnalyticsWarning['ruleId'],
  severity: TrackingAnalyticsWarning['severity'],
  reason: string,
  evidence: Record<string, TrackingFieldValue>,
): TrackingAnalyticsWarning {
  return {
    projectId: item.project.id,
    projectName: item.projectName,
    salesName: item.project.salesName,
    bgName: item.bgName,
    buName: item.buName,
    ruleId,
    severity,
    reason,
    evidence,
    latestTrackingDate: item.latest?.effectiveDate,
  };
}

function projectWarnings(item: ClassifiedProject, today: string): TrackingAnalyticsWarning[] {
  if (item.project.status !== 'tracking') return [];
  const result: TrackingAnalyticsWarning[] = [];
  const health = item.latest?.executionHealth;
  if (health === 'breached') {
    result.push(warning(
      item,
      'HUMAN_BREACHED',
      'high',
      item.latest?.executionHealthReason || '跟踪人员判断承诺已明确未达成',
      { executionHealth: health },
    ));
  }
  if (health === 'at_risk') {
    result.push(warning(
      item,
      'HUMAN_AT_RISK',
      'high',
      item.latest?.executionHealthReason || '跟踪人员判断项目存在高风险',
      { executionHealth: health },
    ));
  }
  const contract = answerNumber(item.project, 'contractAmountCny');
  const collection = snapshotNumber(item.latest, 'cumulativeCollection');
  if (item.suggestedCompletion) {
    result.push(warning(
      item,
      'COLLECTION_REACHED_CONTRACT',
      'medium',
      '累计到款已达到合同金额，请核对交付、利润和其他承诺后人工确认是否结束跟踪',
      { contractAmountCny: contract!, cumulativeCollection: collection! },
    ));
  }
  const approvedGm1 = answerNumber(item.project, 'gm1');
  const forecastGm1 = snapshotNumber(item.latest, 'currentForecastGm1');
  if (approvedGm1 !== undefined && forecastGm1 !== undefined && forecastGm1 < approvedGm1) {
    result.push(warning(
      item,
      'FORECAST_GM1_BELOW_APPROVED',
      'high',
      '当前预测 GM1 低于审批 GM1',
      { approvedGm1, currentForecastGm1: forecastGm1 },
    ));
  }
  const receivableDate = snapshotString(item.latest, 'receivableDate');
  if (
    receivableDate
    && receivableDate < today
    && contract !== undefined
    && (collection ?? 0) < contract
  ) {
    result.push(warning(
      item,
      'RECEIVABLE_OVERDUE',
      'high',
      '应收日期已过且累计到款低于合同金额',
      { receivableDate, contractAmountCny: contract, cumulativeCollection: collection ?? 0 },
    ));
  }
  const milestoneDate = snapshotString(item.latest, 'milestonePlannedCompletionDate');
  if (milestoneDate && milestoneDate < today) {
    result.push(warning(
      item,
      'MILESTONE_OVERDUE',
      'high',
      '当前里程碑计划完成时间已过，项目仍在跟踪中',
      { milestonePlannedCompletionDate: milestoneDate },
    ));
  }
  return result;
}

function groupKind(filters: AnalyticsFilters): AnalyticsGroup['kind'] {
  if (filters.salesName) return 'project';
  if (filters.buId || filters.regionId) return 'sales';
  if (filters.bgId) return 'bu';
  return 'bg';
}

function groupIdentity(
  item: ClassifiedProject,
  kind: AnalyticsGroup['kind'],
): { id: string; label: string; projectId?: string } {
  if (kind === 'project') {
    return { id: item.project.id, label: item.projectName, projectId: item.project.id };
  }
  if (kind === 'sales') {
    return { id: item.project.salesName, label: item.project.salesName };
  }
  if (kind === 'bu') {
    return { id: item.bu?.id ?? `unconfigured-bu:${item.buName}`, label: item.buName };
  }
  return { id: item.bg?.id ?? `unconfigured-bg:${item.bgName}`, label: item.bgName };
}

function aggregateGroups(
  items: ClassifiedProject[],
  kind: AnalyticsGroup['kind'],
  nodes: OrganizationNode[],
): AnalyticsGroup[] {
  const groups = new Map<string, AnalyticsGroup>();
  for (const item of items) {
    const identity = groupIdentity(item, kind);
    const group = groups.get(identity.id) ?? {
      ...identity,
      kind,
      otTotal: 0,
      tracking: 0,
      completed: 0,
      commitmentNotAchieved: 0,
      atRisk: 0,
      suggestedCompletion: 0,
    };
    group.otTotal += 1;
    group.tracking += item.project.status === 'tracking' ? 1 : 0;
    group.completed += item.project.status === 'tracking_completed' ? 1 : 0;
    group.commitmentNotAchieved += item.project.tracking?.completionOutcome === 'not_achieved' ? 1 : 0;
    group.atRisk += item.latest?.executionHealth === 'at_risk' ? 1 : 0;
    group.suggestedCompletion += item.suggestedCompletion ? 1 : 0;
    groups.set(identity.id, group);
  }
  return [...groups.values()].toSorted((left, right) => {
    const leftOrder = nodes.find((node) => node.id === left.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = nodes.find((node) => node.id === right.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.label.localeCompare(right.label, 'zh-CN');
  });
}

export function buildTrackingAnalytics(
  projects: PreauditProject[],
  organization: OrganizationNode[],
  filters: AnalyticsFilters,
  now = new Date(),
): TrackingAnalyticsResult {
  const items = projects
    .filter((project) => OT_STATUSES.has(project.status) && dateInRange(project, filters))
    .map((project): ClassifiedProject => {
      const organizationDetails = classifyOrganization(project, organization);
      const item: ClassifiedProject = {
        project,
        projectName: answerString(project, 'contractName') || project.id,
        latest: latestSnapshot(project),
        suggestedCompletion: false,
        ...organizationDetails,
      };
      item.suggestedCompletion = isSuggestedCompletion(item);
      return item;
    })
    .filter((item) => matchesFilters(item, filters));

  const tracking = items.filter((item) => item.project.status === 'tracking');
  const completed = items.filter((item) => item.project.status === 'tracking_completed');
  const enteredExecution = tracking.length + completed.length;
  const achieved = completed.filter((item) => item.project.tracking?.completionOutcome === 'achieved').length;
  const notAchieved = completed.filter((item) => item.project.tracking?.completionOutcome === 'not_achieved').length;
  const maintainedOutcomes = achieved + notAchieved;
  const kind = groupKind(filters);

  return {
    metrics: {
      otTotal: items.length,
      enteredExecution,
      tracking: tracking.length,
      completed: completed.length,
      notEnteredExecution: items.length - enteredExecution,
      suggestedCompletion: tracking.filter((item) => item.suggestedCompletion).length,
    },
    ratios: {
      completed: ratio(completed.length, enteredExecution),
      tracking: ratio(tracking.length, enteredExecution),
      commitmentAchieved: ratio(achieved, maintainedOutcomes),
    },
    completedDistribution: {
      achieved,
      notAchieved,
      pendingEntry: completed.length - maintainedOutcomes,
    },
    trackingDistribution: {
      normal: tracking.filter((item) => item.latest?.executionHealth === 'normal').length,
      breached: tracking.filter((item) => item.latest?.executionHealth === 'breached').length,
      atRisk: tracking.filter((item) => item.latest?.executionHealth === 'at_risk').length,
      unmaintained: tracking.filter((item) => !item.latest?.executionHealth).length,
    },
    groupKind: kind,
    groups: aggregateGroups(items, kind, organization),
    warnings: items.flatMap((item) => projectWarnings(item, shanghaiDate(now))),
    projects: items.map((item) => ({
      id: item.project.id,
      projectName: item.projectName,
      salesName: item.project.salesName,
      bgName: item.bgName,
      buName: item.buName,
      regionName: item.regionName,
      status: item.project.status,
    })),
  };
}
