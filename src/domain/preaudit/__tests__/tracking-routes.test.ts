import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = {
  recordExternalApproval: vi.fn(),
  verifyAdmissionCondition: vi.fn(),
  getProject: vi.fn(),
  createTrackingSnapshot: vi.fn(),
  completeTracking: vi.fn(),
  listProjects: vi.fn(),
};
const importRepository = {
  get: vi.fn(),
  save: vi.fn(),
};

vi.mock('../bootstrap', () => ({
  getPreauditService: async () => service,
  getTrackingImportRepository: async () => importRepository,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tracking admin routes', () => {
  it('records an external approval decision', async () => {
    const project = { id: 'project-1', status: 'tracking' };
    service.recordExternalApproval.mockResolvedValue(project);
    const route = await import('@/app/api/admin/projects/[id]/external-approval/route');
    const response = await route.POST(
      new Request('http://localhost/api/admin/projects/project-1/external-approval', {
        method: 'POST',
        body: JSON.stringify({
          decision: 'approved',
          decisionDate: '2026-07-29',
          specialApprovalItems: '回款节点须按月跟踪',
          recordedBy: '管理员',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) },
    );

    expect(response.status).toBe(200);
    expect(service.recordExternalApproval).toHaveBeenCalledWith('project-1', {
      decision: 'approved',
      decisionDate: '2026-07-29',
      specialApprovalItems: '回款节点须按月跟踪',
      recordedBy: '管理员',
      externalReference: undefined,
      comments: undefined,
      conditionalReason: undefined,
      conditions: undefined,
    });
    await expect(response.json()).resolves.toEqual({ project });
  });

  it('verifies conditional admission', async () => {
    service.verifyAdmissionCondition.mockResolvedValue({ id: 'project-1', status: 'tracking' });
    const route = await import('@/app/api/admin/projects/[id]/external-approval/verify-condition/route');
    const response = await route.POST(
      new Request('http://localhost/api/admin/projects/project-1/external-approval/verify-condition', {
        method: 'POST',
        body: JSON.stringify({
          result: 'fulfilled',
          comments: '条件已满足',
          verifiedBy: '管理员',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) },
    );

    expect(response.status).toBe(200);
    expect(service.verifyAdmissionCondition).toHaveBeenCalledWith('project-1', {
      result: 'fulfilled',
      comments: '条件已满足',
      verifiedBy: '管理员',
    });
  });

  it('gets tracking data and creates a snapshot', async () => {
    const project = { id: 'project-1', tracking: { snapshots: [] } };
    service.getProject.mockResolvedValue(project);
    service.createTrackingSnapshot.mockResolvedValue(project);
    const trackingRoute = await import('@/app/api/admin/projects/[id]/tracking/route');
    const snapshotsRoute = await import('@/app/api/admin/projects/[id]/tracking/snapshots/route');

    const getResponse = await trackingRoute.GET(
      new Request('http://localhost/api/admin/projects/project-1/tracking'),
      { params: Promise.resolve({ id: 'project-1' }) },
    );
    expect(await getResponse.json()).toEqual({ project });

    const postResponse = await snapshotsRoute.POST(
      new Request('http://localhost/api/admin/projects/project-1/tracking/snapshots', {
        method: 'POST',
        body: JSON.stringify({
          effectiveDate: '2026-07-29',
          values: { projectLatestProgress: '推进中' },
          executionHealth: 'normal',
          executionHealthReason: '按计划执行',
          source: 'manual',
          createdBy: '管理员',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) },
    );
    expect(postResponse.status).toBe(200);
    expect(service.createTrackingSnapshot).toHaveBeenCalledWith('project-1', {
      effectiveDate: '2026-07-29',
      values: { projectLatestProgress: '推进中' },
      executionHealth: 'normal',
      executionHealthReason: '按计划执行',
      baseSnapshotId: undefined,
      source: 'manual',
      importBatchId: undefined,
      note: undefined,
      createdBy: '管理员',
    });
  });

  it('completes tracking', async () => {
    service.completeTracking.mockResolvedValue({ id: 'project-1', status: 'tracking_completed' });
    const route = await import('@/app/api/admin/projects/[id]/tracking/complete/route');
    const response = await route.POST(
      new Request('http://localhost/api/admin/projects/project-1/tracking/complete', {
        method: 'POST',
        body: JSON.stringify({
          completedBy: '管理员',
          note: '履约结束',
          completionOutcome: 'achieved',
          completionOutcomeReason: '',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) },
    );

    expect(response.status).toBe(200);
    expect(service.completeTracking).toHaveBeenCalledWith('project-1', {
      completedBy: '管理员',
      note: '履约结束',
      completionOutcome: 'achieved',
      completionOutcomeReason: '',
    });
  });

  it('previews and persists an uploaded tracking workbook', async () => {
    service.listProjects.mockResolvedValue([]);
    const route = await import('@/app/api/admin/tracking/imports/preview/route');
    const form = new FormData();
    const source = await readFile(path.resolve('data', 'templates', 'project-tracking-2026.xlsx'));
    form.set('file', new File([source], '跟踪表.xlsx'));
    form.set('createdBy', '管理员');

    const response = await route.POST(new Request('http://localhost/api/admin/tracking/imports/preview', {
      method: 'POST',
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(importRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      fileName: '跟踪表.xlsx',
      status: 'previewed',
      createdBy: '管理员',
    }));
  });

  it('confirms selected import rows', async () => {
    const batch = {
      id: 'batch-1',
      fileName: '跟踪表.xlsx',
      status: 'confirmed',
      createdBy: '管理员',
      createdAt: '2026-07-29T08:00:00.000Z',
      preview: { rows: [], summary: { matched: 0, unmatched: 0, ambiguous: 0, invalid: 0, stale: 0 } },
      results: [],
    };
    importRepository.get.mockResolvedValue(batch);
    const route = await import('@/app/api/admin/tracking/imports/[batchId]/confirm/route');
    const response = await route.POST(
      new Request('http://localhost/api/admin/tracking/imports/batch-1/confirm', {
        method: 'POST',
        body: JSON.stringify({ rowNumbers: [3], confirmedBy: '管理员' }),
      }),
      { params: Promise.resolve({ batchId: 'batch-1' }) },
    );

    expect(response.status).toBe(200);
    expect(importRepository.save).toHaveBeenCalledWith(batch);
  });

  it('exports only projects matching the requested ledger filters', async () => {
    service.listProjects.mockResolvedValue([
      {
        id: 'tracking-1',
        salesName: '张三',
        status: 'tracking',
        answers: {
          contractName: { value: '安徽广电项目' },
          salesBu: { value: '政企BU' },
        },
      },
      {
        id: 'rejected-1',
        salesName: '李四',
        status: 'rejected',
        answers: {
          contractName: { value: '其他项目' },
          salesBu: { value: '能源BU' },
        },
      },
    ]);
    const workbook = await readFile(path.resolve('data', 'templates', 'project-tracking-2026.xlsx'));
    vi.doMock('../tracking-workbook', async (importOriginal) => {
      const original = await importOriginal<typeof import('../tracking-workbook')>();
      return { ...original, exportTrackingWorkbook: vi.fn().mockResolvedValue(workbook) };
    });
    const route = await import('@/app/api/admin/tracking/export/route');

    const response = await route.GET(new Request(
      'http://localhost/api/admin/tracking/export?status=tracking&query=%E5%AE%89%E5%BE%BD',
    ));

    expect(response.status).toBe(200);
    const trackingWorkbook = await import('../tracking-workbook');
    expect(trackingWorkbook.exportTrackingWorkbook).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tracking-1' }),
    ]);
  });
});
