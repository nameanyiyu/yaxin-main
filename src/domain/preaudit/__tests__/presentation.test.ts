import { describe, expect, it } from 'vitest';
import { presentProject, presentSalesReview, PROJECT_STATUS_LABELS } from '../presentation';
import type { PreauditProject } from '../types';

function projectFixture(): PreauditProject {
  const now = '2026-07-22T00:00:00.000Z';
  return {
    id: 'project-1',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status: 'pending_review',
    answers: {
      contractName: { value: '测试合同', source: 'sales', updatedAt: now },
      hasProcurement: { value: false, source: 'sales', updatedAt: now },
    },
    messages: [],
    risks: [
      {
        ruleId: 'PROJECT_MARGIN',
        category: 'sales',
        title: '项目利润',
        triggered: true,
        severity: 'blocking',
        reason: 'GM1 不满足底线',
        impact: '阻断',
        evidenceKeys: ['gm1'],
        missingKeys: [],
        followUpQuestions: [],
      },
    ],
    narratives: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('preaudit presentation mapping', () => {
  it('defines a Chinese label for every project status', () => {
    expect(Object.keys(PROJECT_STATUS_LABELS)).toHaveLength(11);
    expect(PROJECT_STATUS_LABELS.pending_review).toBe('待后台复核');
    expect(PROJECT_STATUS_LABELS.pending_manual_submission).toBe('待人工提交');
    expect(PROJECT_STATUS_LABELS.pending_external_decision).toBe('等待外部审批结果');
    expect(PROJECT_STATUS_LABELS.conditional_admission).toBe('有条件准入待核查');
    expect(PROJECT_STATUS_LABELS.tracking).toBe('项目跟踪中');
    expect(PROJECT_STATUS_LABELS.rejected).toBe('审批已驳回');
    expect(PROJECT_STATUS_LABELS.tracking_completed).toBe('跟踪已结束');
  });

  it('returns risk count, required progress, and stable field sections', () => {
    const result = presentProject(projectFixture());
    expect(result.statusLabel).toBe('待后台复核');
    expect(result.triggeredRiskCount).toBe(1);
    expect(result.progress.total).toBeGreaterThan(result.progress.completed);
    expect(result.progress.percent).toBeGreaterThanOrEqual(0);
    expect(result.sections.map((section) => section.key)).toEqual([
      'basic',
      'risk',
      'project',
      'procurement',
      'significance',
      'control',
      'commitment',
    ]);
    expect(result.sections[0].fields.find((field) => field.key === 'contractName')).toMatchObject({
      value: '测试合同',
      answered: true,
    });
  });

  it('prepares the sales review summary and accurate handoff copy', () => {
    const result = presentSalesReview(projectFixture());
    expect(result.sections).toHaveLength(7);
    expect(result.missingRequiredFields.length).toBeGreaterThan(0);
    expect(result.triggeredRisks).toHaveLength(1);
    expect(result.completionTitle).toBe('已提交后台复核');
    expect(result.completionDescription).toContain('等待内部复核');
  });
});
