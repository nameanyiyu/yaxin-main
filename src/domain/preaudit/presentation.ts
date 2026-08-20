import { isFieldRequired } from './interview';
import { getTemplateDefinition } from './template';
import {
  getCommitmentGaps,
  getMissingSalesReviewFields,
  isSalesReadyForReview,
  reportFieldStatus,
  type ReportFieldStatus,
} from './reporting-flow';
import type {
  FieldType,
  FieldValue,
  PreauditProject,
  ProjectStatus,
  TemplateFieldDefinition,
} from './types';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  interviewing: '访谈中',
  preaudit_needs_input: '待补充信息',
  pending_review: '待后台复核',
  reviewed: '已复核',
  pending_manual_submission: '待人工提交',
  pending_external_decision: '等待外部审批结果',
  conditional_admission: '有条件准入待核查',
  tracking: '项目跟踪中',
  rejected: '审批已驳回',
  tracking_completed: '跟踪已结束',
  archived: '已归档',
};

export const SECTION_LABELS = {
  basic: '基本信息',
  risk: '风险核验',
  project: '项目情况',
  procurement: '采购情况',
  significance: '项目意义',
  control: '风险管控',
  commitment: '项目承诺',
} as const;

export type PresentationSectionKey = keyof typeof SECTION_LABELS;

export interface PresentedField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  answered: boolean;
  value?: FieldValue;
  source?: 'sales' | 'reviewer' | 'system' | 'agent';
  status: ReportFieldStatus;
  confidence?: number;
  guidance?: string;
}

export interface PresentedProject {
  statusLabel: string;
  triggeredRiskCount: number;
  progress: { completed: number; total: number; percent: number };
  missingRequiredKeys: string[];
  sections: Array<{
    key: PresentationSectionKey;
    label: string;
    fields: PresentedField[];
  }>;
}

export const SALES_COMPLETION_COPY = {
  title: '已提交后台复核',
  description: '项目信息已进入后台工作台，正在等待内部复核；这不代表已提交外部 OA/飞书审批。',
} as const;

function isAnswered(project: PreauditProject, key: string): boolean {
  const value = project.answers[key]?.value;
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

function isApplicable(project: PreauditProject, field: TemplateFieldDefinition): boolean {
  if (!field.requiredWhen) return true;
  return project.answers[field.requiredWhen.field]?.value === field.requiredWhen.equals;
}

export function presentProject(project: PreauditProject): PresentedProject {
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const applicableFields = template.fields.filter((field) => isApplicable(project, field));
  const requiredFields = applicableFields.filter((field) => isFieldRequired(field, project));
  const completed = requiredFields.filter((field) => isAnswered(project, field.key)).length;
  const total = requiredFields.length;

  return {
    statusLabel: PROJECT_STATUS_LABELS[project.status],
    triggeredRiskCount: project.risks.filter((risk) => risk.triggered).length,
    progress: {
      completed,
      total,
      percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    },
    missingRequiredKeys: requiredFields.filter((field) => !isAnswered(project, field.key)).map((field) => field.key),
    sections: (Object.keys(SECTION_LABELS) as PresentationSectionKey[]).map((key) => ({
      key,
      label: SECTION_LABELS[key],
      fields: applicableFields
        .filter((field) => field.section === key)
        .map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: isFieldRequired(field, project),
          answered: isAnswered(project, field.key),
          value: project.answers[field.key]?.value,
          source: project.answers[field.key]?.source,
          status: reportFieldStatus(project, field),
          confidence: project.answers[field.key]?.confidence,
          guidance: field.guidance,
        })),
    })),
  };
}

export function presentSalesReview(project: PreauditProject) {
  const presentation = presentProject(project);
  const fieldsByKey = new Map(presentation.sections.flatMap((section) => section.fields).map((field) => [field.key, field]));
  return {
    ...presentation,
    missingRequiredFields: presentation.missingRequiredKeys
      .map((key) => fieldsByKey.get(key))
      .filter((field): field is PresentedField => Boolean(field)),
    triggeredRisks: project.risks.filter((risk) => risk.triggered),
    salesReady: isSalesReadyForReview(project),
    missingSalesFields: getMissingSalesReviewFields(project),
    commitmentGaps: getCommitmentGaps(project),
    completionTitle: SALES_COMPLETION_COPY.title,
    completionDescription: SALES_COMPLETION_COPY.description,
  };
}
