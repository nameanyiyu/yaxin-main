import { presentProject } from '../domain/preaudit/presentation';
import { isAbsoluteControlRisk } from '../domain/preaudit/risk-level';
import { PREAUDIT_TEMPLATE_2025_11 } from '../domain/preaudit/template-2025-11';
import type { FieldValue, PreauditProject, ProjectStatus, RiskFinding } from '../domain/preaudit/types';

export type AdminRiskFilter = 'all' | 'triggered' | 'blocking' | 'clear';
export type AdminProjectSort = 'priority' | 'updated_desc' | 'risk_desc' | 'progress_asc';

export interface AdminProjectFilters {
  query: string;
  status: '' | ProjectStatus;
  risk: AdminRiskFilter;
  sort: AdminProjectSort;
}

export interface AdminProjectSummary {
  total: number;
  active: number;
  awaitingReview: number;
  awaitingExport: number;
  awaitingArchive: number;
  needsInput: number;
  blockingRisk: number;
  archived: number;
}

const STATUS_PRIORITY: Record<ProjectStatus, number> = {
  pending_review: 0,
  reviewed: 1,
  pending_manual_submission: 2,
  pending_external_decision: 3,
  conditional_admission: 4,
  tracking: 5,
  preaudit_needs_input: 6,
  interviewing: 7,
  rejected: 8,
  tracking_completed: 9,
  archived: 10,
};

function contractName(project: PreauditProject): string {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : '';
}

function triggeredRisks(project: PreauditProject) {
  return project.risks.filter((risk) => risk.triggered);
}

function priorityScore(project: PreauditProject): number {
  const hasBlockingRisk = triggeredRisks(project).some(isAbsoluteControlRisk);
  if (project.status === 'archived') return 100;
  if (hasBlockingRisk) return -10 + STATUS_PRIORITY[project.status] / 100;
  return STATUS_PRIORITY[project.status];
}

function displayValue(value: FieldValue | undefined): string {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === undefined) return '未提供';
  return String(value);
}

function fieldLabel(key: string): string {
  return PREAUDIT_TEMPLATE_2025_11.fields.find((field) => field.key === key)?.label ?? key;
}

export function projectRiskEvidence(project: PreauditProject, risk: RiskFinding): {
  rows: Array<{ key: string; label: string; value: string; missing: boolean }>;
  missingLabels: string[];
  followUpQuestions: string[];
} {
  const keys = [...new Set([...risk.evidenceKeys, ...risk.missingKeys])];
  return {
    rows: keys.map((key) => ({
      key,
      label: fieldLabel(key),
      value: displayValue(project.answers[key]?.value),
      missing: risk.missingKeys.includes(key),
    })),
    missingLabels: risk.missingKeys.map(fieldLabel),
    followUpQuestions: risk.followUpQuestions,
  };
}

export function projectAction(project: PreauditProject): {
  label: string;
  description: string;
  priority: number;
  tone: 'brand' | 'warning' | 'danger' | 'muted' | 'success';
} {
  const blocking = triggeredRisks(project).some(isAbsoluteControlRisk);
  const actions: Record<ProjectStatus, Omit<ReturnType<typeof projectAction>, 'priority'>> = {
    interviewing: {
      label: '销售访谈进行中',
      description: '等待销售继续回答，后台可查看当前进度。',
      tone: 'muted',
    },
    preaudit_needs_input: {
      label: '等待销售补充',
      description: '必填信息或风险证据仍有缺口。',
      tone: 'warning',
    },
    pending_review: {
      label: '等待后台复核',
      description: blocking ? '存在绝对禁止风险，请优先核验事实和证据。' : '信息已完整，等待复核确认。',
      tone: blocking ? 'danger' : 'brand',
    },
    reviewed: {
      label: '待导出原表',
      description: '后台复核已完成，可以生成客户原始格式工作簿。',
      tone: 'brand',
    },
    pending_manual_submission: {
      label: '待登记人工提交',
      description: '原表已导出，等待登记外部审批单号并归档。',
      tone: 'warning',
    },
    pending_external_decision: {
      label: '登记外部审批结果',
      description: '外部系统尚未接入，请登记实际审批结果。',
      tone: 'warning',
    },
    conditional_admission: {
      label: '核查准入条件',
      description: '项目有条件准入，待确认条件是否满足。',
      tone: 'warning',
    },
    tracking: {
      label: '更新项目跟踪',
      description: '维护本期回款、利润、交付和承诺进展。',
      tone: 'brand',
    },
    rejected: {
      label: '审批已驳回',
      description: '外部审批未通过，项目记录只读保留。',
      tone: 'danger',
    },
    tracking_completed: {
      label: '跟踪已结束',
      description: '项目跟踪已确认结束，历史记录只读保留。',
      tone: 'success',
    },
    archived: {
      label: '流程已归档',
      description: '人工提交信息已登记，内部流程结束。',
      tone: 'success',
    },
  };
  return { ...actions[project.status], priority: priorityScore(project) };
}

export function summarizeAdminProjects(projects: PreauditProject[]): AdminProjectSummary {
  return {
    total: projects.length,
    active: projects.filter((project) => project.status !== 'archived').length,
    awaitingReview: projects.filter((project) => project.status === 'pending_review').length,
    awaitingExport: projects.filter((project) => project.status === 'reviewed').length,
    awaitingArchive: projects.filter((project) => project.status === 'pending_manual_submission').length,
    needsInput: projects.filter((project) => project.status === 'preaudit_needs_input').length,
    blockingRisk: projects.filter((project) =>
      triggeredRisks(project).some(isAbsoluteControlRisk)).length,
    archived: projects.filter((project) => project.status === 'archived').length,
  };
}

export function filterAdminProjects(
  projects: PreauditProject[],
  filters: AdminProjectFilters,
): PreauditProject[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase('zh-CN');
  const filtered = projects.filter((project) => {
    if (filters.status && project.status !== filters.status) return false;
    const risks = triggeredRisks(project);
    if (filters.risk === 'triggered' && risks.length === 0) return false;
    if (filters.risk === 'blocking' && !risks.some(isAbsoluteControlRisk)) return false;
    if (filters.risk === 'clear' && risks.length > 0) return false;
    if (!normalizedQuery) return true;
    return [contractName(project), project.salesName, project.id]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  });

  return filtered.toSorted((left, right) => {
    if (filters.sort === 'priority') {
      return priorityScore(left) - priorityScore(right)
        || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }
    if (filters.sort === 'risk_desc') {
      const leftRisks = triggeredRisks(left);
      const rightRisks = triggeredRisks(right);
      const leftBlocking = leftRisks.some(isAbsoluteControlRisk) ? 1 : 0;
      const rightBlocking = rightRisks.some(isAbsoluteControlRisk) ? 1 : 0;
      return rightBlocking - leftBlocking
        || rightRisks.length - leftRisks.length
        || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }
    if (filters.sort === 'progress_asc') {
      return presentProject(left).progress.percent - presentProject(right).progress.percent
        || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
