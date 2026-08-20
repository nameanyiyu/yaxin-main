import { describe, expect, it } from 'vitest';
import { PREAUDIT_TEMPLATE_2025_11 } from '../template-2025-11';
import { getMissingRequiredFields, getNextQuestion, isReadyForReview } from '../interview';
import type { FieldValue, PreauditProject } from '../types';

function projectWith(values: Record<string, FieldValue> = {}): PreauditProject {
  const now = '2026-07-22T00:00:00.000Z';
  return {
    id: 'project-1',
    templateVersion: PREAUDIT_TEMPLATE_2025_11.version,
    token: PREAUDIT_TEMPLATE_2025_11.token,
    salesName: '测试销售',
    status: 'interviewing',
    answers: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { value, source: 'sales', updatedAt: now }]),
    ),
    messages: [],
    risks: [],
    narratives: {},
    createdAt: now,
    updatedAt: now,
  };
}

function completeValues(overrides: Record<string, FieldValue> = {}): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {
    customerRating: 'A',
    customerCollectionHealth: 1,
    hasProcurement: false,
    chainLevel: 'direct',
    upstreamSigned: true,
    fundingPartyConfirmed: true,
    isBackToBackPayment: false,
    isQualityWhitelistCustomer: false,
    gm1: 10,
    hasChannelFee: false,
  };
  for (const field of PREAUDIT_TEMPLATE_2025_11.fields) {
    if (field.required && !(field.key in values)) {
      values[field.key] = field.type === 'boolean' ? false : field.type === 'number' || field.type === 'amount' || field.type === 'percentage' ? 1 : '已填写';
    }
  }
  return { ...values, ...overrides };
}

describe('preaudit interview progression', () => {
  it('asks required base fields before narrative fields', () => {
    expect(getNextQuestion(projectWith())?.fieldKey).toBe('contractName');
  });

  it('skips procurement fields when procurement is false', () => {
    const project = projectWith(completeValues({ hasProcurement: false }));
    expect(getMissingRequiredFields(project).some((field) => field.section === 'procurement')).toBe(false);
  });

  it('prioritizes risk evidence gaps over optional commitments', () => {
    const project = projectWith(completeValues({ customerRating: 'D' }));
    expect(getNextQuestion(project)?.fieldKey).toBe('prepaymentPercent');
  });

  it('is ready only when required fields and risk evidence are complete', () => {
    expect(isReadyForReview(projectWith(completeValues()))).toBe(true);
    expect(isReadyForReview(projectWith(completeValues({ customerRating: 'D' })))).toBe(false);
  });
});
