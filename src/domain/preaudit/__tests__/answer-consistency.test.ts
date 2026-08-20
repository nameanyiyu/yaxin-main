import { describe, expect, it } from 'vitest';
import { findAnswerConsistencyIssues } from '../answer-consistency';
import { getInterviewBatch } from '../interview-batches';
import type { FieldValue, PreauditProject } from '../types';

const now = '2026-08-18T00:00:00.000Z';

function project(values: Record<string, FieldValue>): PreauditProject {
  return {
    id: 'consistency-project',
    templateVersion: '2026-08',
    token: 'preaudit202608',
    salesName: '测试销售',
    status: 'interviewing',
    answers: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { value, source: 'sales' as const, updatedAt: now }]),
    ),
    messages: [
      { id: 'intro', role: 'assistant', content: '阶段 1/4｜核心信息', createdAt: now },
      { id: 'answer', role: 'user', content: '项目回答', createdAt: now },
    ],
    risks: [],
    narratives: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('answer consistency checks', () => {
  it('does not confuse final acceptance payment with a prepayment percentage', () => {
    const issues = findAnswerConsistencyIssues(project({
      prepaymentPercent: 0,
      commercialTerms: '无预付款，终验后100%付款，非背靠背付款。',
    }));

    expect(issues.some((issue) => issue.id === 'PREPAYMENT_CONFLICT')).toBe(false);
  });

  it('still detects a real positive prepayment conflicting with zero', () => {
    const issues = findAnswerConsistencyIssues(project({
      prepaymentPercent: 0,
      commercialTerms: '合同约定预付款比例为20%，验收后支付尾款。',
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'PREPAYMENT_CONFLICT' }),
    ]));
  });

  it('flags a non-back-to-back field with a back-to-back narrative', () => {
    const issues = findAnswerConsistencyIssues(project({
      isBackToBackPayment: false,
      commercialTerms: '付款方式为收到上游回款后再向供应商付款。',
    }));

    expect(issues).toEqual([
      expect.objectContaining({
        id: 'PAYMENT_TERMS_CONFLICT',
        fields: ['isBackToBackPayment', 'commercialTerms'],
      }),
    ]);
  });

  it('flags final-user funding together with non-back-to-back payment', () => {
    const issues = findAnswerConsistencyIssues(project({
      fundingPartyConfirmed: true,
      fundingStatus: '资金来源为最终用户年度信息化预算，已落实。',
      isBackToBackPayment: false,
      commercialTerms: '非背靠背付款，按里程碑验收付款。',
    }));

    expect(issues).toEqual([
      expect.objectContaining({ id: 'FINAL_USER_FUNDING_PAYMENT_CONFLICT' }),
    ]);
  });

  it('allows a non-back-to-back payment when funding is independently sourced', () => {
    const issues = findAnswerConsistencyIssues(project({
      fundingPartyConfirmed: true,
      fundingStatus: '资金来源为我方自有资金，已落实。',
      isBackToBackPayment: false,
      commercialTerms: '非背靠背付款，按里程碑验收付款。',
    }));

    expect(issues).toHaveLength(0);
  });

  it('returns the conflict as a follow-up batch and clears it after correction', () => {
    const conflicted = project({
      isBackToBackPayment: true,
      commercialTerms: '非背靠背付款，按验收节点付款。',
    });
    const batch = getInterviewBatch(conflicted);

    expect(batch.consistencyIssues).toHaveLength(1);
    expect(batch.questions[0]).toMatchObject({
      id: 'consistency-PAYMENT_TERMS_CONFLICT',
      fieldKeys: ['isBackToBackPayment', 'commercialTerms'],
    });

    conflicted.answers.isBackToBackPayment.value = false;
    expect(getInterviewBatch(conflicted).consistencyIssues ?? []).toHaveLength(0);
  });
});
