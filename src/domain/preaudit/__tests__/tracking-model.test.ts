import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilePreauditRepository } from '../repository';
import type { PreauditProject } from '../types';
import * as trackingFields from '../tracking-fields';

const tempDirectories: string[] = [];

async function makeRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-tracking-model-'));
  tempDirectories.push(directory);
  const repository = new FilePreauditRepository(directory);
  await repository.initialize();
  return repository;
}

function baseProject(): PreauditProject {
  return {
    id: 'project-1',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status: 'interviewing',
    answers: {},
    messages: [],
    risks: [],
    narratives: {},
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('tracking project persistence', () => {
  it('keeps old projects compatible when tracking fields are absent', async () => {
    const repository = await makeRepository();
    const project = baseProject();

    await repository.saveProject(project);

    expect(await repository.getProject(project.id)).toEqual(project);
  });

  it('persists external approval and immutable tracking snapshots', async () => {
    const repository = await makeRepository();
    const project = {
      ...baseProject(),
      status: 'tracking',
      externalApproval: {
        decision: 'approved',
        decisionDate: '2026-07-29',
        recordedBy: '管理员',
        recordedAt: '2026-07-29T01:00:00.000Z',
        history: [{
          id: 'approval-event-1',
          action: 'recorded',
          decision: 'approved',
          operator: '管理员',
          at: '2026-07-29T01:00:00.000Z',
        }],
      },
      tracking: {
        status: 'in_progress',
        currentSnapshotId: 'snapshot-1',
        snapshots: [{
          id: 'snapshot-1',
          effectiveDate: '2026-07-29',
          source: 'manual',
          values: {
            collectionReceived: 100,
            projectLatestProgress: '完成首期交付',
          },
          contentFingerprint: 'fingerprint-1',
          createdBy: '管理员',
          createdAt: '2026-07-29T02:00:00.000Z',
        }],
        createdAt: '2026-07-29T01:00:00.000Z',
        updatedAt: '2026-07-29T02:00:00.000Z',
      },
    } as unknown as PreauditProject;

    await repository.saveProject(project);

    expect(await repository.getProject(project.id)).toEqual(project);
  });
});

describe('tracking approval facts', () => {
  it('derives read-only approval facts and financing summary', () => {
    expect('trackingDerivedValues' in trackingFields).toBe(true);
    const project: PreauditProject = {
      ...baseProject(),
      status: 'tracking',
      answers: {
        salesBu: { value: '政企BU', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        salesRegion: { value: '华东区', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        salesManager: { value: '张三', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        contractName: { value: '安徽广电项目', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        customerName: { value: '安徽广电集团', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        endUserName: { value: '安徽省内用户', source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        contractAmountCny: { value: 20_000_000, source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        gm1: { value: 12.5, source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        hasFinancing: { value: true, source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        directFinancingAmount: { value: 1_000_000, source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
        directFinancingMonths: { value: 6, source: 'sales', updatedAt: '2026-07-29T00:00:00.000Z' },
      },
      narratives: {
        projectOverview: '安徽广电建设项目综合情况',
        commitments: '按期完成回款与交付',
      },
      externalApproval: {
        decision: 'approved',
        decisionDate: '2026-07-29',
        specialApprovalItems: '回款节点须按月跟踪',
        recordedBy: '管理员',
        recordedAt: '2026-07-29T01:00:00.000Z',
        history: [],
      },
    };
    const derive = (trackingFields as unknown as {
      trackingDerivedValues: (input: PreauditProject) => Record<string, unknown>;
    }).trackingDerivedValues;

    expect(derive(project)).toMatchObject({
      salesBu: '政企BU',
      salesRegion: '华东区',
      salesManager: '张三',
      projectName: '安徽广电项目',
      customerName: '安徽广电集团',
      contractAmountCny: 20_000_000,
      approvedGm1: 12.5,
      specialApprovalItems: '回款节点须按月跟踪',
      financingSituation: '直接垫资 1000000 元，期限 6 个月',
      projectSummary: '安徽广电建设项目综合情况',
      businessUnitCommitments: '按期完成回款与交付',
    });
  });

  it('shows supplier tracking only for procurement participation or triggered procurement risk', () => {
    expect('isSupplierTrackingApplicable' in trackingFields).toBe(true);
    const applicable = (trackingFields as unknown as {
      isSupplierTrackingApplicable: (input: PreauditProject) => boolean;
    }).isSupplierTrackingApplicable;
    const project = baseProject();
    expect(applicable(project)).toBe(false);
    expect(applicable({
      ...project,
      answers: {
        hasProcurement: { value: true, source: 'sales', updatedAt: project.updatedAt },
      },
    })).toBe(true);
    expect(applicable({
      ...project,
      risks: [{
        ruleId: 'SUPPLIER_CREDIT',
        category: 'procurement',
        title: '供应商资信',
        triggered: true,
        severity: 'high',
        reason: '评级较低',
        impact: '需要持续跟踪',
        evidenceKeys: ['supplierRating'],
        missingKeys: [],
        followUpQuestions: [],
      }],
    })).toBe(true);
  });
});
