import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilePreauditRepository } from '../repository';
import { PreauditService } from '../service';

const tempDirectories: string[] = [];
let service: PreauditService;

beforeEach(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-external-approval-'));
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

async function projectWaitingForDecision() {
  return service.createAdminProject({
    salesName: '张三',
    contractName: '安徽广电项目',
    token: 'preaudit202511',
    templateVersion: '2025-11',
    status: 'pending_external_decision',
  });
}

describe('external approval lifecycle', () => {
  it('requires special approval items for approved and conditional decisions', async () => {
    const approvedProject = await projectWaitingForDecision();
    await expect(service.recordExternalApproval(approvedProject.id, {
      decision: 'approved',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
    })).rejects.toMatchObject({
      code: 'INVALID_EXTERNAL_APPROVAL',
      message: '已完成审批或有条件准入时必须填写特批事项',
    });

    const conditionalProject = await projectWaitingForDecision();
    await expect(service.recordExternalApproval(conditionalProject.id, {
      decision: 'conditional',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      conditionalReason: '需补充回款保障',
      conditions: '取得客户付款承诺函',
    })).rejects.toMatchObject({
      code: 'INVALID_EXTERNAL_APPROVAL',
      message: '已完成审批或有条件准入时必须填写特批事项',
    });
  });

  it('records approval and opens an empty tracking ledger', async () => {
    const project = await projectWaitingForDecision();

    const approved = await service.recordExternalApproval(project.id, {
      decision: 'approved',
      decisionDate: '2026-07-29',
      externalReference: 'OA-2026-001',
      comments: '审批通过',
      specialApprovalItems: '回款节点须按月跟踪',
      recordedBy: '管理员',
    });

    expect(approved).toMatchObject({
      status: 'tracking',
      externalApproval: {
        decision: 'approved',
        externalReference: 'OA-2026-001',
        specialApprovalItems: '回款节点须按月跟踪',
        recordedBy: '管理员',
        history: [{
          action: 'recorded',
          decision: 'approved',
          operator: '管理员',
          specialApprovalItems: '回款节点须按月跟踪',
        }],
      },
      tracking: { status: 'not_started', snapshots: [] },
    });
  });

  it('requires a rejection reason and records a rejected terminal state', async () => {
    const project = await projectWaitingForDecision();

    await expect(service.recordExternalApproval(project.id, {
      decision: 'rejected',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      comments: '',
    })).rejects.toMatchObject({ code: 'INVALID_EXTERNAL_APPROVAL' });

    const rejected = await service.recordExternalApproval(project.id, {
      decision: 'rejected',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      comments: '客户资信未通过',
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.externalApproval?.comments).toBe('客户资信未通过');
  });

  it('keeps conditional admission pending until conditions are verified', async () => {
    const project = await projectWaitingForDecision();

    await expect(service.recordExternalApproval(project.id, {
      decision: 'conditional',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      conditionalReason: '',
      conditions: '',
    })).rejects.toMatchObject({ code: 'INVALID_EXTERNAL_APPROVAL' });

    const conditional = await service.recordExternalApproval(project.id, {
      decision: 'conditional',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      conditionalReason: '需补充回款保障',
      conditions: '取得客户付款承诺函',
      specialApprovalItems: '取得承诺函后按月跟踪回款',
    });
    expect(conditional).toMatchObject({
      status: 'conditional_admission',
      externalApproval: {
        decision: 'conditional',
        verification: { result: 'pending' },
      },
    });

    const fulfilled = await service.verifyAdmissionCondition(project.id, {
      result: 'fulfilled',
      comments: '承诺函已收到',
      verifiedBy: '复核管理员',
    });
    expect(fulfilled).toMatchObject({
      status: 'tracking',
      externalApproval: {
        decision: 'approved',
        verification: { result: 'fulfilled', verifiedBy: '复核管理员' },
        history: [
          { action: 'recorded' },
          { action: 'condition_fulfilled', operator: '复核管理员' },
        ],
      },
      tracking: { status: 'not_started', snapshots: [] },
    });
  });

  it('moves failed conditions to rejected', async () => {
    const project = await projectWaitingForDecision();
    await service.recordExternalApproval(project.id, {
      decision: 'conditional',
      decisionDate: '2026-07-29',
      recordedBy: '管理员',
      conditionalReason: '需补充担保',
      conditions: '一周内提供担保函',
      specialApprovalItems: '担保函到位后方可启动',
    });

    const failed = await service.verifyAdmissionCondition(project.id, {
      result: 'failed',
      comments: '未按期提供担保函',
      verifiedBy: '复核管理员',
    });

    expect(failed).toMatchObject({
      status: 'rejected',
      externalApproval: {
        decision: 'rejected',
        verification: { result: 'failed' },
      },
    });
  });
});
