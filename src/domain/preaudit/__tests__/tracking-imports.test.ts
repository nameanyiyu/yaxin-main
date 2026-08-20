import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilePreauditRepository } from '../repository';
import { PreauditService } from '../service';
import {
  FileTrackingImportRepository,
  confirmTrackingImportBatch,
  type TrackingImportBatch,
} from '../tracking-imports';

const tempDirectories: string[] = [];

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-tracking-imports-'));
  tempDirectories.push(directory);
  const projectRepository = new FilePreauditRepository(directory);
  await projectRepository.initialize();
  let sequence = 0;
  const service = new PreauditService(projectRepository, {
    idFactory: () => `generated-${++sequence}`,
    now: () => '2026-07-29T08:00:00.000Z',
  });
  const importRepository = new FileTrackingImportRepository(directory);
  await importRepository.initialize();
  return { service, importRepository };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('tracking import batches', () => {
  it('persists previews and confirms selected valid rows idempotently', async () => {
    const { service, importRepository } = await setup();
    const created = await service.createAdminProject({
      salesName: '张三',
      contractName: '安徽广电项目',
      token: 'preaudit202511',
      templateVersion: '2025-11',
      status: 'pending_external_decision',
    });
    const approved = await service.recordExternalApproval(created.id, {
      decision: 'approved',
      decisionDate: '2026-07-29',
      specialApprovalItems: '低毛利特批',
      recordedBy: '管理员',
    });
    const batch: TrackingImportBatch = {
      id: 'batch-1',
      fileName: '跟踪表.xlsx',
      status: 'previewed',
      createdBy: '管理员',
      createdAt: '2026-07-29T08:00:00.000Z',
      preview: {
        summary: { matched: 1, unmatched: 0, ambiguous: 0, invalid: 0, stale: 0 },
        rows: [{
          rowNumber: 3,
          matchStatus: 'matched',
          projectId: approved.id,
          candidateProjectIds: [approved.id],
          effectiveDate: '2026-07-29',
          values: { cumulativeCollection: 100000, projectLatestProgress: '完成首验' },
          changes: [],
          errors: [],
        }],
      },
      results: [],
    };
    await importRepository.save(batch);

    const confirmed = await confirmTrackingImportBatch(
      await importRepository.get('batch-1'),
      service,
      [3],
      '导入管理员',
      '2026-07-29T09:00:00.000Z',
    );
    await importRepository.save(confirmed);

    expect(confirmed).toMatchObject({
      status: 'confirmed',
      results: [{ rowNumber: 3, projectId: approved.id, status: 'imported' }],
    });
    expect((await service.getProject(approved.id)).tracking?.snapshots).toHaveLength(1);

    const repeated = await confirmTrackingImportBatch(
      await importRepository.get('batch-1'),
      service,
      [3],
      '导入管理员',
      '2026-07-29T09:30:00.000Z',
    );
    expect(repeated.results).toHaveLength(1);
    expect((await service.getProject(approved.id)).tracking?.snapshots).toHaveLength(1);
  });

  it('rejects rows that are not matched and valid', async () => {
    const { service } = await setup();
    const batch: TrackingImportBatch = {
      id: 'batch-2',
      fileName: '错误表.xlsx',
      status: 'previewed',
      createdBy: '管理员',
      createdAt: '2026-07-29T08:00:00.000Z',
      preview: {
        summary: { matched: 0, unmatched: 1, ambiguous: 0, invalid: 0, stale: 0 },
        rows: [{
          rowNumber: 3,
          matchStatus: 'unmatched',
          candidateProjectIds: [],
          values: {},
          changes: [],
          errors: [],
        }],
      },
      results: [],
    };

    await expect(confirmTrackingImportBatch(
      batch,
      service,
      [3],
      '管理员',
      '2026-07-29T09:00:00.000Z',
    )).rejects.toMatchObject({ code: 'INVALID_IMPORT_SELECTION' });
  });
});
