import { findAnswerConsistencyIssues } from './answer-consistency';
import { getMissingRequiredFields, isFieldRequired } from './interview';
import type { RiskRuleConfig } from './risk-config';
import { getTemplateDefinition } from './template';
import type {
  FieldAnswer,
  PreauditProject,
  ProjectConversationState,
  TemplateFieldDefinition,
} from './types';

export const BACKEND_VERIFICATION_FIELD_KEYS = new Set([
  'customerRating',
  'customerCollectionHealth',
  'endUserRating',
  'supplierRating',
  'supplierHighRiskStatus',
  'isQualityWhitelistCustomer',
  'customerBlacklistMatch',
]);

export const CORE_COMMITMENT_FIELD_KEYS = [
  'collectionCommitment',
  'marginCommitment',
  'deliveryCommitment',
  'newOpportunityCommitment',
] as const;

const POST_CONFIRMATION_FIELD_KEYS = new Set([
  'triggeredControlPoints',
  'divisionCommitment',
  'contractRiskControl',
  'deliveryRiskControl',
  'collectionRiskControl',
  'otherRiskControl',
  ...CORE_COMMITMENT_FIELD_KEYS,
  'supplierCommitment',
  'newOpportunityCommitment',
  'otherCommitment',
]);

export type ReportFieldStatus =
  | 'recorded'
  | 'needs_confirmation'
  | 'missing'
  | 'backend_verification';

export interface CommitmentGap {
  fieldKey: string;
  missingParts: Array<'target' | 'time' | 'terms' | 'owner' | 'assurance'>;
}

function hasAnswer(project: PreauditProject, key: string): boolean {
  const value = project.answers[key]?.value;
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

function isApplicable(project: PreauditProject, field: TemplateFieldDefinition): boolean {
  if (!field.requiredWhen) return true;
  return project.answers[field.requiredWhen.field]?.value === field.requiredWhen.equals;
}

export function defaultConversationState(): ProjectConversationState {
  return {
    phase: 'project_report',
    askedTopicIds: [],
    notifiedRiskIds: [],
  };
}

export function conversationState(project: PreauditProject): ProjectConversationState {
  return project.conversationState ?? defaultConversationState();
}

export function projectBg(project: PreauditProject): 'TSG' | 'DIG' | 'SCG' | undefined {
  const value = project.answers.salesBg?.value;
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SIG') return 'SCG';
  return normalized === 'TSG' || normalized === 'DIG' || normalized === 'SCG' ? normalized : undefined;
}

export function riskRuleAppliesToProject(rule: RiskRuleConfig, project: PreauditProject): boolean {
  return rule.scope === 'COMPANY' || rule.scope === projectBg(project);
}

export function reportFieldStatus(project: PreauditProject, field: TemplateFieldDefinition): ReportFieldStatus {
  if (BACKEND_VERIFICATION_FIELD_KEYS.has(field.key)) return 'backend_verification';
  const answer = project.answers[field.key];
  if (!answer) return 'missing';
  if (answer.source === 'system' || answer.confirmationStatus === 'backend_verification') return 'backend_verification';
  if (answer.confirmationStatus === 'needs_confirmation' || answer.source === 'agent') return 'needs_confirmation';
  return 'recorded';
}

export function getMissingSalesReportFields(project: PreauditProject): TemplateFieldDefinition[] {
  return getMissingRequiredFields(project).filter(
    (field) => !BACKEND_VERIFICATION_FIELD_KEYS.has(field.key) && !POST_CONFIRMATION_FIELD_KEYS.has(field.key),
  );
}

function textAnswer(project: PreauditProject, key: string): string {
  const value = project.answers[key]?.value;
  return typeof value === 'string' ? value.trim() : '';
}

function hasOwner(text: string): boolean {
  return /(责任人|负责人|由.{1,12}(负责|牵头)|销售经理|项目经理|交付经理|事业部|项目组|团队)/.test(text);
}

function hasTime(text: string): boolean {
  return /(\d{4}[年/-]\d{1,2}|\d{1,2}[月号日]|月底|月末|季度|周内|天内|个月内|签约后|验收后|上线前|上线后)/.test(text);
}

function hasAssurance(text: string): boolean {
  return /(保障|措施|跟进|检查|预警|控制|锁定|复核|验收|里程碑|预算|成本|台账|催收|升级|资源)/.test(text);
}

function explicitlyNoNewOpportunity(text: string): boolean {
  return /(暂无|没有|无)(?:可承诺的|明确的|新增的|衍生)?(?:新商机|后续商机|衍生项目|新项目)(?:承诺|计划|机会)?/.test(text)
    || /新商机承诺[：:]?(?:无|暂无|没有)/.test(text);
}

export function getCommitmentGaps(project: PreauditProject): CommitmentGap[] {
  if (project.templateVersion !== '2026-08') return [];
  const required: string[] = [...CORE_COMMITMENT_FIELD_KEYS];
  if (project.answers.hasProcurement?.value === true) required.push('supplierCommitment');

  return required.flatMap((fieldKey) => {
    const text = textAnswer(project, fieldKey);
    const missingParts: CommitmentGap['missingParts'] = [];
    if (!text) return [{ fieldKey, missingParts: ['target', 'time', 'terms', 'owner', 'assurance'] }];

    if (fieldKey === 'collectionCommitment') {
      if (!/(首笔|首款|第一笔)/.test(text) || !/(全部|全额|尾款)/.test(text)) missingParts.push('target');
      if (!hasTime(text)) missingParts.push('time');
      if (!/(付款|开票|验收|签约|条件|节点)/.test(text)) missingParts.push('terms');
    } else if (fieldKey === 'deliveryCommitment') {
      if (!/(交付|上线|验收|质量|标准)/.test(text)) missingParts.push('target');
      if (!hasTime(text)) missingParts.push('time');
      if (!/(验收标准|验收条件|按合同验收|质量标准|测试通过)/.test(text)) missingParts.push('terms');
    } else if (fieldKey === 'marginCommitment') {
      if (!/(GM1|毛利|利润|%|％)/i.test(text)) missingParts.push('target');
    } else if (fieldKey === 'newOpportunityCommitment') {
      if (explicitlyNoNewOpportunity(text)) return [];
      if (!/(新商机|后续商机|衍生项目|新项目|扩容|续约|二期|三期|复制|合作机会)/.test(text)) missingParts.push('target');
      if (!hasTime(text)) missingParts.push('time');
    } else if (!/(供应商|采购|分包|付款|交付)/.test(text)) {
      missingParts.push('target');
    } else if (!/(付款|节点|二次分包|转包)/.test(text)) {
      missingParts.push('terms');
    }
    if (!hasOwner(text)) missingParts.push('owner');
    if (!hasAssurance(text)) missingParts.push('assurance');
    return missingParts.length ? [{ fieldKey, missingParts }] : [];
  });
}

export function getMissingSalesReviewFields(project: PreauditProject): TemplateFieldDefinition[] {
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const required = template.fields.filter(
    (field) => isApplicable(project, field)
      && isFieldRequired(field, project)
      && !BACKEND_VERIFICATION_FIELD_KEYS.has(field.key)
      && !hasAnswer(project, field.key),
  );
  const mandatoryCommitments = project.templateVersion === '2026-08'
    ? [
        ...CORE_COMMITMENT_FIELD_KEYS,
        ...(project.answers.hasProcurement?.value === true ? ['supplierCommitment'] : []),
      ]
    : [];
  for (const key of mandatoryCommitments) {
    if (hasAnswer(project, key) || required.some((field) => field.key === key)) continue;
    const field = template.fields.find((candidate) => candidate.key === key);
    if (field) required.push(field);
  }
  return required;
}

export function unresolvedSalesRiskKeys(project: PreauditProject): string[] {
  return [...new Set(project.risks
    .flatMap((risk) => risk.missingKeys)
    .filter((key) => !BACKEND_VERIFICATION_FIELD_KEYS.has(key)))];
}

export function isSalesReadyForReview(project: PreauditProject): boolean {
  if (getMissingSalesReviewFields(project).length > 0) return false;
  if (project.templateVersion === '2026-08' && getCommitmentGaps(project).length > 0) return false;
  if (findAnswerConsistencyIssues(project).length > 0) return false;
  return unresolvedSalesRiskKeys(project).length === 0;
}

export function confirmationMetadata(answer: FieldAnswer): Pick<FieldAnswer, 'confidence' | 'confirmationStatus'> {
  return {
    ...(answer.confidence === undefined ? {} : { confidence: answer.confidence }),
    ...(answer.confirmationStatus === undefined ? {} : { confirmationStatus: answer.confirmationStatus }),
  };
}
