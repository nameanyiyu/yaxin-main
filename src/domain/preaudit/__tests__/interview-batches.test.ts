import { describe, expect, it } from 'vitest';
import {
  formatInterviewBatch,
  getInterviewBatch,
  hasBatchedInterviewStarted,
  interviewBatchMatchesMessage,
  INTERVIEW_STAGES,
  PROJECT_INTRODUCTION_OUTLINE,
  toInterviewBatchPayload,
} from '../interview-batches';
import { BACKEND_VERIFICATION_FIELD_KEYS } from '../reporting-flow';
import { PREAUDIT_TEMPLATE_2026_08 } from '../template-2026-08';
import type { FieldValue, PreauditProject } from '../types';

const now = '2026-08-19T00:00:00.000Z';

function completeValues(): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of PREAUDIT_TEMPLATE_2026_08.fields) {
    values[field.key] = field.type === 'boolean' ? false : ['number', 'amount', 'percentage'].includes(field.type) ? 1 : '已填写';
  }
  return {
    ...values,
    salesBg: 'DIG',
    hasProcurement: false,
    hasDirectFinancing: false,
    hasPotentialFinancing: false,
    chainLevel: 'direct',
    gm1: 10,
    collectionCommitment: '签约后首笔回款于2026年10月完成，全部回款于2027年3月完成，由销售经理负责，建立每周催收台账保障执行。',
    marginCommitment: '承诺GM1不低于10%，由项目经理负责锁定预算并每月复核成本，异常时升级事业部。',
    deliveryCommitment: '2027年2月完成交付验收，按合同验收标准执行，由交付经理负责，通过里程碑检查和资源保障推进。',
    newOpportunityCommitment: '承诺2027年6月前形成扩容新商机，由销售经理负责，每月跟进客户并维护商机台账。',
    divisionCommitment: '按已确认的回款、利润和交付承诺执行。',
  };
}

function project(input: Partial<PreauditProject> = {}): PreauditProject {
  return {
    id: 'project-1', templateVersion: '2026-08', token: 'preaudit202608', salesName: '张三', status: 'interviewing',
    answers: {}, messages: [], risks: [], narratives: {}, createdAt: now, updatedAt: now, ...input,
  };
}

function withIntroduction(values: Record<string, FieldValue> = {}, input: Partial<PreauditProject> = {}): PreauditProject {
  return project({
    answers: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, source: 'sales' as const, updatedAt: now }])),
    messages: [
      { id: 'intro', role: 'assistant', content: '阶段 1/5｜项目汇报', createdAt: now },
      { id: 'answer', role: 'user', content: '完整项目汇报', createdAt: now },
    ],
    ...input,
  });
}

describe('five-stage project reporting interview', () => {
  it('starts with a six-topic free-form project report', () => {
    const batch = getInterviewBatch(project());
    expect(batch).toMatchObject({ stage: 1, stageLabel: '项目汇报', introductionRound: true });
    expect(PROJECT_INTRODUCTION_OUTLINE).toHaveLength(6);
    expect(formatInterviewBatch(batch, '张三')).toContain('阶段 1/5｜项目汇报');
  });

  it('asks at most two related follow-ups and never asks sales for backend verification fields', () => {
    const batch = getInterviewBatch(withIntroduction({ salesBg: 'DIG', salesBu: 'SIO', salesRegion: '华东', salesManager: '张三' }));
    expect(batch.questions.length).toBeLessThanOrEqual(2);
    expect(batch.questions.flatMap((question) => question.fieldKeys).some((key) => BACKEND_VERIFICATION_FIELD_KEYS.has(key))).toBe(false);
  });

  it('keeps only missing fields inside a grouped follow-up', () => {
    const values = completeValues();
    delete values.contractName;
    const batch = getInterviewBatch(withIntroduction(values));
    const group = batch.questions.find((question) => question.id === 'project-and-customer');
    expect(group?.fieldKeys).toEqual(['contractName']);
    expect(group?.question).toContain('项目名称');
    expect(group?.question).not.toContain('签约客户和最终用户');
  });

  it('moves to the report card before risk review', () => {
    const batch = getInterviewBatch(withIntroduction(completeValues()));
    expect(batch).toMatchObject({ stage: 2, stageLabel: '信息确认', awaitingSummaryConfirmation: true });
    expect(formatInterviewBatch(batch)).toContain('项目汇报已经整理成信息卡');
  });

  it('waits for explicit risk acknowledgement after summary confirmation', () => {
    const batch = getInterviewBatch(withIntroduction(completeValues(), {
      conversationState: { phase: 'risk_review', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now },
    }));
    expect(batch).toMatchObject({ stage: 3, stageLabel: '风险核对', awaitingRiskAcknowledgement: true });
  });

  it('asks risk controls and commitments after risks are acknowledged', () => {
    const values = completeValues();
    delete values.contractRiskControl;
    delete values.collectionCommitment;
    const batch = getInterviewBatch(withIntroduction(values, {
      conversationState: { phase: 'commitments', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now, risksAcknowledgedAt: now },
    }));
    expect(batch.stage).toBe(4);
    expect(batch.questions).toHaveLength(2);
    expect(batch.questions.flatMap((question) => question.fieldKeys)).toEqual(expect.arrayContaining(['contractRiskControl', 'collectionCommitment']));
  });

  it('continues asking when a commitment lacks trackable details', () => {
    const values = completeValues();
    values.collectionCommitment = '尽快回款';
    const batch = getInterviewBatch(withIntroduction(values, {
      conversationState: { phase: 'commitments', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now, risksAcknowledgedAt: now },
    }));
    expect(batch.questions.find((question) => question.id === 'commitment-quality-collectionCommitment')?.question).toContain('责任人');
  });

  it('asks for the mandatory new-opportunity commitment and accepts an explicit none', () => {
    const values = completeValues();
    delete values.newOpportunityCommitment;
    const state = { phase: 'commitments' as const, askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now, risksAcknowledgedAt: now };
    const missing = getInterviewBatch(withIntroduction(values, { conversationState: state }));
    expect(missing.questions.some((question) => question.fieldKeys.includes('newOpportunityCommitment'))).toBe(true);

    values.newOpportunityCommitment = '暂无新商机承诺';
    expect(getInterviewBatch(withIntroduction(values, { conversationState: state })).readyForReview).toBe(true);
  });

  it('reaches stage five only when sales information and commitments are complete', () => {
    const batch = getInterviewBatch(withIntroduction(completeValues(), {
      conversationState: { phase: 'commitments', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now, risksAcknowledgedAt: now },
    }));
    expect(batch).toMatchObject({ stage: 5, stageLabel: '完成送审', readyForReview: true });
    expect(batch.progress).toMatchObject({ totalStages: 5, percent: 100 });
  });

  it('shows a newly triggered absolute risk immediately without claiming admission', () => {
    const batch = getInterviewBatch(withIntroduction({ salesBg: 'DIG' }, {
      risks: [{ ruleId: 'COMPANY_EMPTY_TURNOVER', category: 'sales', title: '空转合同', triggered: true, severity: 'blocking', controlLevel: 'absolute', controlRequirement: '禁止签约', reason: '确认存在空转', impact: '禁止', evidenceKeys: [], missingKeys: [], followUpQuestions: [] }],
    }));
    const text = formatInterviewBatch(batch);
    expect(text).toContain('即时红线提示');
    expect(text).toContain('不代表可以签约或自动准入');
  });

  it('returns flow flags and topic ids in the canonical payload', () => {
    const payload = toInterviewBatchPayload(withIntroduction({ salesBg: 'DIG' }));
    expect(payload.questions.length).toBeLessThanOrEqual(2);
    expect(payload.topicIds).toEqual(payload.questions.map((question) => question.id));
  });

  it('detects a stale repeated prompt after the underlying conflict is fixed', () => {
    const values = completeValues();
    delete values.isEmptyTurnoverContract;
    const batch = getInterviewBatch(withIntroduction(values));
    expect(interviewBatchMatchesMessage(batch, '阶段 1/5｜项目汇报\n1. 请确认客户预付款比例，付款说明和结构化比例以合同约定为准。')).toBe(false);
    expect(interviewBatchMatchesMessage(batch, formatInterviewBatch(batch))).toBe(true);
  });

  it('does not treat an older multi-question batch as the current narrowed batch', () => {
    const values = completeValues();
    delete values.productCapability;
    const batch = getInterviewBatch(withIntroduction(values));
    const old = '阶段 1/5｜项目汇报\n1. 请确认项目是否存在空转、融资性贸易/融资担保或非本 BG 主业的情形，并简要说明判断依据。\n2. 请说明项目的战略价值、产品能力沉淀、后续延续机会，以及与客户的历史合作情况；没有的项目可明确说“无”。';
    expect(batch.questions).toHaveLength(1);
    expect(interviewBatchMatchesMessage(batch, old)).toBe(false);
    expect(interviewBatchMatchesMessage(batch, formatInterviewBatch(batch))).toBe(true);
  });

  it('recognizes the free-form introduction on resume without duplicating it', () => {
    const batch = getInterviewBatch(project());
    expect(interviewBatchMatchesMessage(batch, formatInterviewBatch(batch, '张三'))).toBe(true);
  });

  it('detects new and legacy guided introductions', () => {
    expect(hasBatchedInterviewStarted(project())).toBe(false);
    expect(hasBatchedInterviewStarted(withIntroduction())).toBe(true);
    expect(hasBatchedInterviewStarted(project({ messages: [{ id: 'legacy', role: 'assistant', content: '第 1/5 轮｜项目介绍', createdAt: now }] }))).toBe(true);
  });

  it('uses exactly the five approved stages', () => {
    expect(INTERVIEW_STAGES.map((stage) => stage.label)).toEqual(['项目汇报', '信息确认', '风险核对', '应对与承诺', '完成送审']);
  });
});
