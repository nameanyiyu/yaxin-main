import { findAnswerConsistencyIssues, type AnswerConsistencyIssue } from './answer-consistency';
import {
  conversationState,
  getCommitmentGaps,
  getMissingSalesReportFields,
  getMissingSalesReviewFields,
  isSalesReadyForReview,
  unresolvedSalesRiskKeys,
} from './reporting-flow';
import { getTemplateDefinition } from './template';
import type { PreauditProject } from './types';

export const INTERVIEW_STAGES = [
  { id: 1, label: '项目汇报' },
  { id: 2, label: '信息确认' },
  { id: 3, label: '风险核对' },
  { id: 4, label: '应对与承诺' },
  { id: 5, label: '完成送审' },
] as const;

export const PROJECT_INTRODUCTION_OUTLINE = [
  '客户与项目：签约客户、最终用户、建设内容和商机来源',
  '金额与利润：合同额、净销售额、GM1 和收入确认方式',
  '签约与资金：签约链条、当前进展、资金来源和落实情况',
  '付款与回款：预付款、付款节点、是否背靠背和预计回款安排',
  '交付：工期、交付范围、验收节点和交付资源',
  '采购与垫资：是否外采、供应商、采购金额及是否存在垫资',
] as const;

export type InterviewStage = 1 | 2 | 3 | 4 | 5;

export interface InterviewBatchQuestion {
  id: string;
  fieldKeys: string[];
  question: string;
}

export interface InterviewProgress {
  currentStage: InterviewStage;
  totalStages: 5;
  stageLabel: string;
  completedGroups: number;
  totalGroups: number;
  percent: number;
}

export interface InterviewBatch {
  stage: InterviewStage;
  stageLabel: string;
  questions: InterviewBatchQuestion[];
  readyForReview: boolean;
  missingFieldKeys: string[];
  introductionRound: boolean;
  awaitingSummaryConfirmation: boolean;
  awaitingRiskAcknowledgement: boolean;
  progress: InterviewProgress;
  consistencyIssues?: AnswerConsistencyIssue[];
  absoluteRisks: PreauditProject['risks'];
}

interface QuestionGroup extends InterviewBatchQuestion {
  condition?: 'procurement' | 'financing';
}

const REPORT_GROUPS: QuestionGroup[] = [
  { id: 'project-and-customer', fieldKeys: ['contractName', 'customerName', 'endUserName', 'opportunitySource', 'projectBackground'], question: '请补充项目名称、签约客户和最终用户全称，并用两三句话说明项目建设内容和商机来源。' },
  { id: 'amount-and-profit', fieldKeys: ['contractAmountCny', 'gm1', 'hasChannelFee', 'amountMarginRecognition'], question: '合同总额、净销售额、GM1 和收入确认方式分别是什么？如果包含渠道费用，也请一起说明。' },
  { id: 'contract-chain', fieldKeys: ['chainLevel', 'nonOperatorCount', 'upstreamSigned', 'contractChainProgress'], question: '请说明最终用户到我司的完整签约链条、我司所处层级、上游签约状态和当前签约进展。' },
  { id: 'funding-and-payment', fieldKeys: ['fundingPartyConfirmed', 'fundingStatus', 'isBackToBackPayment', 'prepaymentPercent', 'commercialTerms'], question: '请说明资金方、资金来源及落实情况，以及预付款比例、付款节点、是否背靠背和验收条件。' },
  { id: 'business-form', fieldKeys: ['isEmptyTurnoverContract', 'isFinancingTradeContract', 'hasNonMainBusiness'], question: '请确认项目是否存在空转、融资性贸易/融资担保或非本 BG 主业的情形，并简要说明判断依据。' },
  { id: 'procurement-gate', fieldKeys: ['hasProcurement'], question: '项目是否涉及采购、外包或分包？如果不涉及，直接说明“不涉及”即可。' },
  { id: 'procurement-detail', condition: 'procurement', fieldKeys: ['isPureProcurement', 'externalProcurementAmount', 'externalProcurementPercent', 'supplierName', 'procurementOverview', 'supplierOverview', 'procurementTerms'], question: '请说明采购内容、原因、金额和成本占比，以及供应商全称、交付能力和上下游付款安排。' },
  { id: 'financing-gate', fieldKeys: ['hasDirectFinancing', 'hasPotentialFinancing'], question: '项目是否存在直接垫资，或因账期、里程碑、背靠背条款形成潜在垫资？' },
  { id: 'financing-detail', condition: 'financing', fieldKeys: ['directFinancingAmount', 'directFinancingMonths', 'potentialFinancingAmount', 'financingOverview'], question: '请补充垫资金额、期限、形成原因和对应的回款或付款安排。' },
  { id: 'project-value', fieldKeys: ['strategicAlignment', 'productCapability', 'projectContinuity', 'historicalCooperation'], question: '请说明项目的战略价值、产品能力沉淀、后续延续机会，以及与客户的历史合作情况；没有的项目可明确说“无”。' },
];

const COMMITMENT_LABELS: Record<string, string> = {
  collectionCommitment: '回款承诺', marginCommitment: '利润承诺', deliveryCommitment: '交付承诺', newOpportunityCommitment: '新商机承诺', supplierCommitment: '供应商承诺',
};

const FIELD_QUESTION_OVERRIDES: Record<string, string> = {
  contractRiskControl: '针对已识别的签约风险，请先说明准备采取什么措施、由谁负责、何时完成，以及用什么材料证明落实。没有新增风险时请明确说“无”。',
  deliveryRiskControl: '针对交付风险，请说明控制措施、负责人、完成时间和检查或验收证据。没有新增风险时请明确说“无”。',
  collectionRiskControl: '针对回款风险，请说明催收或付款保障措施、负责人、执行时间和跟踪证据。没有新增风险时请明确说“无”。',
  collectionCommitment: '请给出可兑现的回款承诺：首笔回款和全部回款的时间、对应付款条件、责任人及保障措施。',
  marginCommitment: '请给出可兑现的利润承诺：要守住的 GM1 或利润目标、成本控制措施、异常处理方式和责任人。',
  deliveryCommitment: '请给出可兑现的交付承诺：交付与验收时间、验收标准、负责人或团队，以及资源保障措施。',
  newOpportunityCommitment: '请说明新商机承诺：可落地的新商机或衍生项目目标、预计形成时间、责任人和跟进措施；如当前确实没有，请明确回答“暂无新商机承诺”。',
  supplierCommitment: '请给出供应商承诺：供应商交付节点、付款约束、禁止违规二次分包的落实方式、负责人和检查证据。',
};

function hasAnswer(project: PreauditProject, key: string): boolean {
  const value = project.answers[key]?.value;
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

function conditionApplies(group: QuestionGroup, project: PreauditProject): boolean {
  if (!group.condition) return true;
  if (group.condition === 'procurement') return project.answers.hasProcurement?.value === true;
  return project.answers.hasDirectFinancing?.value === true || project.answers.hasPotentialFinancing?.value === true;
}

function validFieldKeys(project: PreauditProject, keys: string[]): string[] {
  const templateKeys = new Set(getTemplateDefinition({ token: project.token, version: project.templateVersion }).fields.map((field) => field.key));
  return keys.filter((key) => templateKeys.has(key));
}

function introductionHasResponse(project: PreauditProject): boolean {
  const firstBatchIndex = project.messages.findIndex(isFirstBatchMessage);
  return firstBatchIndex >= 0 && project.messages.slice(firstBatchIndex + 1).some((message) => message.role === 'user');
}

function isFirstBatchMessage(message: PreauditProject['messages'][number]): boolean {
  return message.role === 'assistant' && (
    /阶段\s*1\/(?:4|5)\s*[｜|]\s*(?:项目汇报|核心信息)/.test(message.content)
    || /第\s*1\/\d+\s*轮(?:，请按编号一起回答|｜项目介绍|｜核心信息)/.test(message.content)
  );
}

export function hasBatchedInterviewStarted(project: PreauditProject): boolean {
  return project.messages.some(isFirstBatchMessage);
}

function absoluteRisks(project: PreauditProject): PreauditProject['risks'] {
  const notified = new Set(conversationState(project).notifiedRiskIds);
  return project.risks.filter((risk) => risk.triggered && (risk.controlLevel === 'absolute' || risk.severity === 'blocking') && !notified.has(risk.ruleId));
}

function progress(stage: InterviewStage): InterviewProgress {
  return { currentStage: stage, totalStages: 5, stageLabel: INTERVIEW_STAGES[stage - 1].label, completedGroups: 0, totalGroups: 0, percent: stage === 5 ? 100 : Math.round(((stage - 1) / 5) * 100) };
}

function prioritizeUnasked(project: PreauditProject, questions: InterviewBatchQuestion[]): InterviewBatchQuestion[] {
  const asked = new Set(conversationState(project).askedTopicIds);
  return [...questions].sort((left, right) => Number(asked.has(left.id)) - Number(asked.has(right.id)));
}

function reportQuestions(project: PreauditProject): InterviewBatchQuestion[] {
  const missing = new Set([...getMissingSalesReportFields(project).map((field) => field.key), ...unresolvedSalesRiskKeys(project)]);
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const labels = new Map(template.fields.map((field) => [field.key, field.label]));
  const grouped = REPORT_GROUPS.filter((group) => conditionApplies(group, project)).map((group) => {
    const fieldKeys = validFieldKeys(project, group.fieldKeys).filter((key) => missing.has(key) && !hasAnswer(project, key));
    if (!fieldKeys.length) return undefined;
    const question = fieldKeys.length === group.fieldKeys.length
      ? group.question
      : `本组其他信息已记录，请只补充${fieldKeys.map((key) => labels.get(key) ?? key).join('、')}。`;
    return { id: group.id, fieldKeys, question };
  }).filter((question): question is InterviewBatchQuestion => Boolean(question));
  const covered = new Set(grouped.flatMap((question) => question.fieldKeys));
  const fallback = [...missing].filter((key) => !covered.has(key) && !hasAnswer(project, key)).map((key) => {
    const field = template.fields.find((candidate) => candidate.key === key);
    return { id: `field-${key}`, fieldKeys: [key], question: field?.question ?? `请补充“${key}”。` };
  });
  return prioritizeUnasked(project, [...grouped, ...fallback]).slice(0, 2);
}

function commitmentGapQuestion(fieldKey: string, missingParts: string[]): InterviewBatchQuestion {
  const labels: Record<string, string> = { target: '明确目标', time: '完成时间', terms: '对应付款条件或验收标准', owner: '责任人', assurance: '保障措施或证据' };
  return {
    id: `commitment-quality-${fieldKey}`,
    fieldKeys: [fieldKey],
    question: `${COMMITMENT_LABELS[fieldKey] ?? '项目承诺'}已经记下，但还缺少${missingParts.map((part) => labels[part] ?? part).join('、')}。请只补充真实、可以兑现的内容；如果目前无法承诺，也请明确说明。`,
  };
}

function commitmentQuestions(project: PreauditProject): InterviewBatchQuestion[] {
  const postKeys = new Set(['contractRiskControl', 'deliveryRiskControl', 'collectionRiskControl', 'otherRiskControl', 'collectionCommitment', 'marginCommitment', 'deliveryCommitment', 'newOpportunityCommitment', 'supplierCommitment']);
  const missing = getMissingSalesReviewFields(project).filter((field) => postKeys.has(field.key) && !hasAnswer(project, field.key)).map((field) => ({ id: `field-${field.key}`, fieldKeys: [field.key], question: FIELD_QUESTION_OVERRIDES[field.key] ?? field.question }));
  const missingKeys = new Set(missing.flatMap((question) => question.fieldKeys));
  const quality = getCommitmentGaps(project).filter((gap) => !missingKeys.has(gap.fieldKey)).map((gap) => commitmentGapQuestion(gap.fieldKey, gap.missingParts));
  return prioritizeUnasked(project, [...missing, ...quality]).slice(0, 2);
}

function baseBatch(project: PreauditProject, stage: InterviewStage, questions: InterviewBatchQuestion[]): InterviewBatch {
  return {
    stage, stageLabel: INTERVIEW_STAGES[stage - 1].label, questions, readyForReview: false,
    missingFieldKeys: [...new Set(questions.flatMap((question) => question.fieldKeys))], introductionRound: false,
    awaitingSummaryConfirmation: false, awaitingRiskAcknowledgement: false, progress: progress(stage), absoluteRisks: absoluteRisks(project),
  };
}

export function getInterviewBatch(project: PreauditProject): InterviewBatch {
  if (!introductionHasResponse(project)) {
    return { ...baseBatch(project, 1, [{ id: 'project-introduction', fieldKeys: [], question: '请先按提纲完整介绍项目，已经明确的信息我会一次性整理，后续只补充真正缺失的内容。' }]), introductionRound: true };
  }
  const state = conversationState(project);
  if (!state.summaryConfirmedAt || state.phase === 'project_report' || state.phase === 'information_confirmation') {
    const issues = findAnswerConsistencyIssues(project);
    if (issues.length) {
      const questions = issues.slice(0, 2).map((item) => ({ id: `consistency-${item.id}`, fieldKeys: item.fields, question: item.question }));
      return { ...baseBatch(project, 1, questions), consistencyIssues: issues };
    }
    const questions = reportQuestions(project);
    if (questions.length) return baseBatch(project, 1, questions);
    return { ...baseBatch(project, 2, []), awaitingSummaryConfirmation: true };
  }
  if (!state.risksAcknowledgedAt || state.phase === 'risk_review') return { ...baseBatch(project, 3, []), awaitingRiskAcknowledgement: true };
  const issues = findAnswerConsistencyIssues(project);
  if (issues.length) {
    const questions = issues.slice(0, 2).map((item) => ({ id: `consistency-${item.id}`, fieldKeys: item.fields, question: item.question }));
    return { ...baseBatch(project, 4, questions), consistencyIssues: issues };
  }
  const questions = commitmentQuestions(project);
  if (questions.length) return baseBatch(project, 4, questions);
  if (isSalesReadyForReview(project)) return { ...baseBatch(project, 5, []), readyForReview: true, progress: progress(5) };
  const fallback = getMissingSalesReviewFields(project).slice(0, 2).map((field) => ({ id: `required-${field.key}`, fieldKeys: [field.key], question: FIELD_QUESTION_OVERRIDES[field.key] ?? field.question }));
  return baseBatch(project, 4, fallback);
}

export function formatInterviewBatch(batch: InterviewBatch, salesName?: string): string {
  const warning = batch.absoluteRisks.length ? [
    '⚠️ 即时红线提示：系统已命中绝对禁止风险。资料仍可送内部后台复核，但这不代表可以签约或自动准入。',
    ...batch.absoluteRisks.map((risk) => `- ${risk.title}：${risk.reason} ${risk.controlRequirement ?? ''}`.trim()), '',
  ] : [];
  const greeting = salesName ? `您好 ${salesName}！\n` : '';
  if (batch.readyForReview) return [...warning, '阶段 5/5｜完成送审\n销售信息及回款、利润、交付、新商机承诺已完整。请在页面核对承诺卡后送后台复核。'].join('\n');
  if (batch.introductionRound) return [...warning, `${greeting}阶段 1/5｜项目汇报`, '请像做项目汇报一样，一次把您掌握的情况讲完整。我会自动整理到审批表，后面每轮最多补问两个相关问题。', '', ...PROJECT_INTRODUCTION_OUTLINE.map((item, index) => `${index + 1}. ${item}`), '', '不用按固定格式，也不需要判断客户评级、黑白名单或供应商风险，这些由系统和后台核验。'].join('\n');
  if (batch.awaitingSummaryConfirmation) return [...warning, '阶段 2/5｜信息确认\n项目汇报已经整理成信息卡，请在页面集中确认；需要修改时可以返回继续补充。'].join('\n');
  if (batch.awaitingRiskAcknowledgement) return [...warning, '阶段 3/5｜风险核对\n系统已按“公司级规则 + 当前所属 BG 规则”完成风险核对。请在页面查看并知悉后，再进入应对措施和项目承诺。'].join('\n');
  const reminder = batch.stage === 4 ? '以下应对措施和承诺会进入正式审批材料，并用于后续项目跟踪。请只承诺真实可执行的目标、时间和责任。' : '我已经整理好本轮内容。';
  return [...warning, `${greeting}阶段 ${batch.stage}/5｜${batch.stageLabel}`, reminder, ...batch.questions.map((item, index) => `${index + 1}. ${item.question}`)].join('\n');
}

export function interviewBatchMatchesMessage(batch: InterviewBatch, content: string): boolean {
  const hasStage = new RegExp(`阶段\\s*${batch.stage}\\/(?:4|5)\\s*[｜|]\\s*${batch.stageLabel}`).test(content);
  if (!hasStage) return false;
  if (batch.introductionRound) return content.includes('请像做项目汇报一样，一次把您掌握的情况讲完整');
  if (batch.questions.length > 0) {
    const numberedQuestions = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
    if (numberedQuestions.length !== batch.questions.length) return false;
    return batch.questions.every((question) => numberedQuestions.includes(question.question));
  }
  if (batch.readyForReview) return content.includes('完成送审');
  if (batch.awaitingSummaryConfirmation) return content.includes('信息卡');
  if (batch.awaitingRiskAcknowledgement) return content.includes('风险核对');
  return true;
}

export function toInterviewBatchPayload(project: PreauditProject) {
  const batch = getInterviewBatch(project);
  return {
    readyForReview: batch.readyForReview, stage: batch.stage, stageLabel: batch.stageLabel, questions: batch.questions,
    missingFieldKeys: batch.missingFieldKeys, introductionRound: batch.introductionRound,
    awaitingSummaryConfirmation: batch.awaitingSummaryConfirmation, awaitingRiskAcknowledgement: batch.awaitingRiskAcknowledgement,
    progress: batch.progress, consistencyIssues: batch.consistencyIssues ?? [], absoluteRisks: batch.absoluteRisks,
    topicIds: batch.questions.map((question) => question.id), notifiedRiskIds: batch.absoluteRisks.map((risk) => risk.ruleId),
    message: formatInterviewBatch(batch),
  };
}
