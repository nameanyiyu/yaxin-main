import { describe, expect, it } from 'vitest';
import {
  filterAdminProjects,
  projectAction,
  projectRiskEvidence,
  summarizeAdminProjects,
  type AdminProjectFilters,
} from '../../../lib/admin-workbench';
import type { PreauditProject, ProjectStatus, RiskFinding } from '../types';

const now = '2026-07-23T06:00:00.000Z';

function projectFixture(
  id: string,
  status: ProjectStatus,
  options: {
    salesName?: string;
    contractName?: string;
    updatedAt?: string;
    risks?: RiskFinding[];
    answeredKeys?: string[];
  } = {},
): PreauditProject {
  return {
    id,
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: options.salesName ?? '张三',
    status,
    answers: Object.fromEntries([
      ['contractName', options.contractName ?? `合同-${id}`],
      ...(options.answeredKeys ?? []).map((key) => [key, `${key}-value`]),
    ].map(([key, value]) => [key, { value, source: 'sales' as const, updatedAt: now }])),
    messages: [],
    risks: options.risks ?? [],
    narratives: {},
    createdAt: '2026-07-22T06:00:00.000Z',
    updatedAt: options.updatedAt ?? now,
  };
}

const blockingRisk: RiskFinding = {
  ruleId: 'BLOCKING',
  category: 'sales',
  title: '阻断风险',
  triggered: true,
  severity: 'blocking',
  reason: '缺少关键证据',
  impact: '阻断',
  evidenceKeys: ['gm1'],
  missingKeys: ['gm1'],
  followUpQuestions: ['GM1 是多少？'],
};

describe('admin workbench project rules', () => {
  it('summarizes real projects into actionable counters', () => {
    const projects = [
      projectFixture('a', 'pending_review', { risks: [blockingRisk] }),
      projectFixture('b', 'reviewed'),
      projectFixture('c', 'pending_manual_submission'),
      projectFixture('d', 'archived'),
      projectFixture('e', 'preaudit_needs_input'),
    ];

    expect(summarizeAdminProjects(projects)).toEqual({
      total: 5,
      active: 4,
      awaitingReview: 1,
      awaitingExport: 1,
      awaitingArchive: 1,
      needsInput: 1,
      blockingRisk: 1,
      archived: 1,
    });
  });

  it('searches by contract name and sales name, then filters by status and risk', () => {
    const projects = [
      projectFixture('a', 'pending_review', {
        salesName: '李明',
        contractName: '海外软件合同',
        risks: [blockingRisk],
      }),
      projectFixture('b', 'reviewed', {
        salesName: '王芳',
        contractName: '设备采购合同',
      }),
    ];
    const filters: AdminProjectFilters = {
      query: '李明',
      status: 'pending_review',
      risk: 'blocking',
      sort: 'updated_desc',
    };

    expect(filterAdminProjects(projects, filters).map((project) => project.id)).toEqual(['a']);
    expect(filterAdminProjects(projects, { ...filters, query: '采购' })).toEqual([]);
  });

  it('sorts urgent actionable work ahead of lower-priority records', () => {
    const projects = [
      projectFixture('archive', 'archived'),
      projectFixture('interview', 'interviewing'),
      projectFixture('manual', 'pending_manual_submission'),
      projectFixture('review', 'pending_review', { risks: [blockingRisk] }),
      projectFixture('blocked-input', 'preaudit_needs_input', { risks: [blockingRisk] }),
    ];

    const result = filterAdminProjects(projects, {
      query: '',
      status: '',
      risk: 'all',
      sort: 'priority',
    });

    expect(result.map((project) => project.id)).toEqual([
      'review',
      'blocked-input',
      'manual',
      'interview',
      'archive',
    ]);
  });

  it('maps every workflow state to an honest next action', () => {
    expect(projectAction(projectFixture('a', 'pending_review')).label).toBe('等待后台复核');
    expect(
      projectAction(projectFixture('absolute', 'pending_review', { risks: [blockingRisk] })).description,
    ).toContain('绝对禁止风险');
    expect(projectAction(projectFixture('b', 'reviewed')).label).toBe('待导出原表');
    expect(projectAction(projectFixture('c', 'pending_manual_submission')).label).toBe('待登记人工提交');
    expect(projectAction(projectFixture('d', 'archived')).label).toBe('流程已归档');
  });

  it('places evidence values, missing facts, and follow-up questions beside a risk', () => {
    const project = projectFixture('risk', 'pending_review', { risks: [blockingRisk] });
    project.answers.gm1 = { value: 4, source: 'sales', updatedAt: now };

    expect(projectRiskEvidence(project, blockingRisk)).toEqual({
      rows: [
        {
          key: 'gm1',
          label: '合同利润率（GM1）',
          value: '4',
          missing: true,
        },
      ],
      missingLabels: ['合同利润率（GM1）'],
      followUpQuestions: ['GM1 是多少？'],
    });
  });
});
