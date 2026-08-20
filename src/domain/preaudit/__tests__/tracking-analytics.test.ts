import { describe, expect, it } from 'vitest';
import { defaultOrganizationConfig, type OrganizationNode } from '../organization-config';
import { buildTrackingAnalytics } from '../tracking-analytics';
import type {
  ExecutionHealth,
  FieldAnswer,
  PreauditProject,
  ProjectStatus,
  TrackingFieldValue,
} from '../types';

const now = '2026-07-30T08:00:00.000Z';

function organizations(): OrganizationNode[] {
  const nodes = defaultOrganizationConfig(now);
  const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC')!;
  const sio = nodes.find((node) => node.type === 'bu' && node.name === 'SIO')!;
  nodes.push(
    { id: 'region-east', type: 'region', name: '华东区', parentId: cmc.id, enabled: true, sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'region-north', type: 'region', name: '华北区', parentId: sio.id, enabled: true, sortOrder: 0, createdAt: now, updatedAt: now },
  );
  return nodes;
}

function answer(value: string | number | boolean): FieldAnswer {
  return { value, source: 'reviewer', updatedAt: now };
}

function project(
  id: string,
  status: ProjectStatus,
  options: {
    salesName?: string;
    bu?: string;
    region?: string;
    executionHealth?: ExecutionHealth;
    values?: Record<string, TrackingFieldValue>;
    completionOutcome?: 'achieved' | 'not_achieved';
  } = {},
): PreauditProject {
  const bu = options.bu ?? 'CMC';
  const bg = ['SIO', 'AID', 'AIS'].includes(bu) ? 'DIG' : 'TSG';
  const snapshot = options.values || options.executionHealth
    ? {
      id: `${id}-snapshot`,
      effectiveDate: '2026-07-29',
      source: 'manual' as const,
      values: options.values ?? {},
      executionHealth: options.executionHealth,
      executionHealthReason: options.executionHealth === 'normal' ? undefined : '需要关注',
      contentFingerprint: `${id}-fingerprint`,
      createdBy: '管理员',
      createdAt: now,
    }
    : undefined;
  return {
    id,
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: options.salesName ?? '张三',
    status,
    answers: {
      contractName: answer(`项目 ${id}`),
      salesBg: answer(bg),
      salesBu: answer(bu),
      salesRegion: answer(options.region ?? (bu === 'CMC' ? '华东区' : '华北区')),
      contractAmountCny: answer(100),
      gm1: answer(10),
    },
    messages: [],
    risks: [],
    narratives: {},
    externalApproval: {
      decision: status === 'rejected' ? 'rejected' : 'approved',
      decisionDate: '2026-07-01',
      recordedBy: '管理员',
      recordedAt: '2026-07-01T08:00:00.000Z',
      history: [],
    },
    tracking: ['tracking', 'tracking_completed'].includes(status)
      ? {
        status: status === 'tracking_completed' ? 'completed' : 'in_progress',
        currentSnapshotId: snapshot?.id,
        snapshots: snapshot ? [snapshot] : [],
        completionOutcome: options.completionOutcome,
        completedAt: status === 'tracking_completed' ? now : undefined,
        createdAt: now,
        updatedAt: now,
      }
      : undefined,
    createdAt: '2026-06-30T08:00:00.000Z',
    updatedAt: now,
  };
}

describe('tracking analytics', () => {
  it('separates OT, execution and historical incomplete outcomes', () => {
    const projects = [
      project('pending', 'pending_external_decision'),
      project('conditional', 'conditional_admission'),
      project('rejected', 'rejected'),
      project('tracking-normal', 'tracking', { executionHealth: 'normal' }),
      project('tracking-risk', 'tracking', { executionHealth: 'at_risk' }),
      project('completed-achieved', 'tracking_completed', { completionOutcome: 'achieved' }),
      project('completed-history', 'tracking_completed'),
    ];

    const result = buildTrackingAnalytics(projects, organizations(), {}, new Date(now));

    expect(result.metrics).toMatchObject({
      otTotal: 7,
      enteredExecution: 4,
      tracking: 2,
      completed: 2,
      notEnteredExecution: 3,
    });
    expect(result.completedDistribution).toEqual({
      achieved: 1,
      notAchieved: 0,
      pendingEntry: 1,
    });
    expect(result.trackingDistribution).toEqual({
      normal: 1,
      breached: 0,
      atRisk: 1,
      unmaintained: 0,
    });
    expect(result.ratios).toMatchObject({
      completed: 50,
      tracking: 50,
      commitmentAchieved: 100,
    });
  });

  it('keeps human status primary and emits independent system warnings', () => {
    const tracked = project('full-collection', 'tracking', {
      executionHealth: 'normal',
      values: {
        cumulativeCollection: 100,
        currentForecastGm1: 8,
        receivableDate: '2026-07-20',
        milestonePlannedCompletionDate: '2026-07-15',
      },
    });

    const result = buildTrackingAnalytics([tracked], organizations(), {}, new Date(now));

    expect(result.trackingDistribution.normal).toBe(1);
    expect(result.metrics.suggestedCompletion).toBe(1);
    expect(result.warnings.map((warning) => warning.ruleId)).toEqual(expect.arrayContaining([
      'COLLECTION_REACHED_CONTRACT',
      'FORECAST_GM1_BELOW_APPROVED',
      'MILESTONE_OVERDUE',
    ]));
    expect(result.warnings.map((warning) => warning.ruleId)).not.toContain('RECEIVABLE_OVERDUE');
  });

  it('warns for overdue receivables before full collection', () => {
    const tracked = project('overdue', 'tracking', {
      executionHealth: 'normal',
      values: {
        cumulativeCollection: 40,
        receivableDate: '2026-07-20',
      },
    });
    const result = buildTrackingAnalytics([tracked], organizations(), {}, new Date(now));

    expect(result.warnings).toContainEqual(expect.objectContaining({
      projectId: 'overdue',
      ruleId: 'RECEIVABLE_OVERDUE',
      severity: 'high',
    }));
  });

  it('filters linked organization values and produces BG drilldown groups', () => {
    const projects = [
      project('tsg-1', 'tracking', { executionHealth: 'normal', bu: 'CMC', salesName: '张三' }),
      project('dig-1', 'tracking', { executionHealth: 'at_risk', bu: 'SIO', salesName: '李四' }),
    ];
    const nodes = organizations();
    const tsg = nodes.find((node) => node.type === 'bg' && node.name === 'TSG')!;

    const all = buildTrackingAnalytics(projects, nodes, {}, new Date(now));
    const filtered = buildTrackingAnalytics(projects, nodes, { bgId: tsg.id }, new Date(now));

    expect(all.groups.map((group) => group.label)).toEqual(['TSG', 'DIG']);
    expect(filtered.metrics.otTotal).toBe(1);
    expect(filtered.groupKind).toBe('bu');
    expect(filtered.groups).toEqual([
      expect.objectContaining({ label: 'CMC', otTotal: 1 }),
    ]);
  });

  it('dynamically maps historical BU values and isolates unknown organizations', () => {
    const mapped = project('mapped', 'tracking', { executionHealth: 'normal' });
    delete mapped.answers.salesBg;
    const unknown = project('unknown', 'tracking', { executionHealth: 'normal' });
    unknown.answers.salesBu = answer('未知 BU');
    delete unknown.answers.salesBg;

    const result = buildTrackingAnalytics([mapped, unknown], organizations(), {}, new Date(now));

    expect(result.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'TSG', otTotal: 1 }),
      expect.objectContaining({ label: '待配置', otTotal: 1 }),
    ]));
  });

  it('returns null ratios for empty denominators', () => {
    const result = buildTrackingAnalytics(
      [project('rejected', 'rejected')],
      organizations(),
      {},
      new Date(now),
    );

    expect(result.ratios.completed).toBeNull();
    expect(result.ratios.tracking).toBeNull();
    expect(result.ratios.commitmentAchieved).toBeNull();
  });
});
