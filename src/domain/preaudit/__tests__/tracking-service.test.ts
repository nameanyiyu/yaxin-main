import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilePreauditRepository } from '../repository';
import { PreauditService } from '../service';

const tempDirectories: string[] = [];
let service: PreauditService;

beforeEach(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-tracking-service-'));
  tempDirectories.push(directory);
  const repository = new FilePreauditRepository(directory);
  await repository.initialize();
  let sequence = 0;
  service = new PreauditService(repository, {
    idFactory: () => `generated-${++sequence}`,
    now: () => '2026-07-29T08:00:00.000Z',
  });
});

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function approvedProject() {
  const project = await service.createAdminProject({
    salesName: '张三',
    contractName: '安徽广电项目',
    token: 'preaudit202511',
    templateVersion: '2025-11',
    status: 'pending_external_decision',
  });
  await service.updateAdminProject(project.id, { salesName: '张三' });
  return service.recordExternalApproval(project.id, {
    decision: 'approved',
    decisionDate: '2026-07-29',
    specialApprovalItems: '按月跟踪回款',
    recordedBy: '管理员',
  });
}

describe('tracking snapshots', () => {
  it('requires a reason for breached and at-risk manual snapshots', async () => {
    const project = await approvedProject();

    await expect(service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '进度存在延期' },
      executionHealth: 'at_risk',
      executionHealthReason: '',
      source: 'manual',
      createdBy: '管理员',
    })).rejects.toMatchObject({
      code: 'INVALID_TRACKING_INPUT',
      message: '高风险预警或明确承诺未达成时，请填写执行状态说明',
    });
  });

  it('creates the first immutable snapshot without copying approval facts', async () => {
    const project = await approvedProject();

    const updated = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: {
        cumulativeCollection: 100,
        projectLatestProgress: '完成首期交付',
        profitCommitmentStatus: 'at_risk',
      },
      executionHealth: 'at_risk',
      executionHealthReason: '利润承诺存在风险',
      source: 'manual',
      createdBy: '跟踪管理员',
    });

    expect(updated).toMatchObject({
      status: 'tracking',
      tracking: {
        status: 'in_progress',
        currentSnapshotId: expect.any(String),
        snapshots: [{
          effectiveDate: '2026-07-29',
          source: 'manual',
          executionHealth: 'at_risk',
          executionHealthReason: '利润承诺存在风险',
          values: {
            cumulativeCollection: 100,
            projectLatestProgress: '完成首期交付',
            profitCommitmentStatus: 'at_risk',
          },
          createdBy: '跟踪管理员',
        }],
      },
    });
    expect(updated.tracking?.snapshots[0].values).not.toHaveProperty('projectName');
    expect(updated.tracking?.snapshots[0].values).not.toHaveProperty('salesManager');
  });

  it('rejects derived approval facts and inapplicable supplier fields', async () => {
    const project = await approvedProject();

    await expect(service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectName: '试图覆盖项目名称' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    })).rejects.toMatchObject({
      code: 'INVALID_TRACKING_INPUT',
      message: expect.stringContaining('不可编辑'),
    });

    await expect(service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { procurementContract: '采购合同已签署' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    })).rejects.toMatchObject({
      code: 'INVALID_TRACKING_INPUT',
      message: '当前项目不涉及采购，不能填写供应商跟踪字段',
    });
  });

  it('inherits the previous snapshot and supports explicit clearing', async () => {
    const project = await approvedProject();
    const first = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: {
        currentMilestone: '需求确认',
        currentIssues: '等待客户资料',
        cumulativeCollection: 100,
      },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    });

    const second = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-08-05',
      baseSnapshotId: first.tracking?.currentSnapshotId,
      values: {
        currentMilestone: '上线准备',
        currentIssues: '#CLEAR',
        cumulativeCollection: '',
      },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    });

    expect(second.tracking?.snapshots).toHaveLength(2);
    expect(second.tracking?.snapshots[0].values).toMatchObject({
      currentMilestone: '需求确认',
      currentIssues: '等待客户资料',
    });
    expect(second.tracking?.snapshots[1].values).toMatchObject({
      currentMilestone: '上线准备',
      currentIssues: null,
      cumulativeCollection: 100,
    });
  });

  it('rejects stale bases and deduplicates identical snapshots', async () => {
    const project = await approvedProject();
    const first = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '已启动' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    });

    const duplicate = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '已启动' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    });
    expect(duplicate.tracking?.snapshots).toHaveLength(1);

    await expect(service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-08-05',
      baseSnapshotId: 'stale-snapshot',
      values: { projectLatestProgress: '继续推进' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    })).rejects.toMatchObject({ code: 'TRACKING_CONFLICT' });
    expect(first.tracking?.snapshots).toHaveLength(1);
  });

  it('completes tracking without changing locked snapshots', async () => {
    const project = await approvedProject();
    const tracked = await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '合同履约完成' },
      executionHealth: 'normal',
      source: 'manual',
      createdBy: '管理员',
    });

    const completed = await service.completeTracking(project.id, {
      completedBy: '管理员',
      note: '回款与交付均已完成',
      completionOutcome: 'achieved',
      completionOutcomeReason: '',
    });

    expect(completed).toMatchObject({
      status: 'tracking_completed',
      tracking: {
        status: 'completed',
        completedBy: '管理员',
        completionNote: '回款与交付均已完成',
        completionOutcome: 'achieved',
        snapshots: tracked.tracking?.snapshots,
      },
    });
  });

  it('requires a reason when completed commitments were not achieved', async () => {
    const project = await approvedProject();
    await service.createTrackingSnapshot(project.id, {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '确认停止' },
      executionHealth: 'breached',
      executionHealthReason: '客户取消项目',
      source: 'manual',
      createdBy: '管理员',
    });

    await expect(service.completeTracking(project.id, {
      completedBy: '管理员',
      note: '结束跟踪',
      completionOutcome: 'not_achieved',
      completionOutcomeReason: '',
    })).rejects.toMatchObject({
      code: 'INVALID_TRACKING_INPUT',
      message: '承诺未达成时，请填写未达成原因',
    });
  });
});
