import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { PreauditService } from './service';
import type { TrackingImportPreview } from './tracking-workbook';

export class TrackingImportError extends Error {
  constructor(
    readonly code: 'IMPORT_BATCH_NOT_FOUND' | 'INVALID_IMPORT_SELECTION' | 'IMPORT_STATE_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'TrackingImportError';
  }
}

export interface TrackingImportResult {
  rowNumber: number;
  projectId: string;
  status: 'imported' | 'already_imported';
}

export interface TrackingImportBatch {
  id: string;
  fileName: string;
  status: 'previewed' | 'confirmed' | 'failed';
  createdBy: string;
  createdAt: string;
  preview: TrackingImportPreview;
  confirmedBy?: string;
  confirmedAt?: string;
  results: TrackingImportResult[];
}

const batchSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(['previewed', 'confirmed', 'failed']),
  createdBy: z.string(),
  createdAt: z.string(),
  preview: z.object({
    rows: z.array(z.object({
      rowNumber: z.number(),
      matchStatus: z.enum(['matched', 'unmatched', 'ambiguous', 'invalid', 'stale']),
      projectId: z.string().optional(),
      candidateProjectIds: z.array(z.string()),
      effectiveDate: z.string().optional(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      changes: z.array(z.object({
        key: z.string(),
        previous: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        next: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      })),
      errors: z.array(z.string()),
    })),
    summary: z.object({
      matched: z.number(),
      unmatched: z.number(),
      ambiguous: z.number(),
      invalid: z.number(),
      stale: z.number(),
    }),
  }),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
  results: z.array(z.object({
    rowNumber: z.number(),
    projectId: z.string(),
    status: z.enum(['imported', 'already_imported']),
  })),
});
const batchesSchema = z.array(batchSchema);

export class FileTrackingImportRepository {
  private readonly stateFile: string;
  private readonly temporaryFile: string;
  private batches = new Map<string, TrackingImportBatch>();
  private initialized = false;
  private writeQueue = Promise.resolve();

  constructor(private readonly dataDirectory: string) {
    this.stateFile = path.join(dataDirectory, 'tracking-imports.json');
    this.temporaryFile = path.join(dataDirectory, 'tracking-imports.json.tmp');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    let raw: string;
    try {
      raw = await readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      raw = '[]';
      await this.write([]);
    }
    try {
      const batches = batchesSchema.parse(JSON.parse(raw)) as TrackingImportBatch[];
      this.batches = new Map(batches.map((batch) => [batch.id, structuredClone(batch)]));
      this.initialized = true;
    } catch {
      throw new TrackingImportError('IMPORT_STATE_INVALID', '无法读取项目跟踪导入批次');
    }
  }

  async get(id: string): Promise<TrackingImportBatch> {
    this.assertInitialized();
    const batch = this.batches.get(id);
    if (!batch) throw new TrackingImportError('IMPORT_BATCH_NOT_FOUND', '导入批次不存在');
    return structuredClone(batch);
  }

  async save(batch: TrackingImportBatch): Promise<void> {
    this.assertInitialized();
    const validated = batchSchema.parse(batch) as TrackingImportBatch;
    const operation = this.writeQueue.catch(() => undefined).then(async () => {
      const previous = this.batches.get(validated.id);
      this.batches.set(validated.id, structuredClone(validated));
      try {
        await this.write([...this.batches.values()]);
      } catch (error) {
        if (previous) this.batches.set(previous.id, previous);
        else this.batches.delete(validated.id);
        throw error;
      }
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new TrackingImportError('IMPORT_STATE_INVALID', '导入批次仓储尚未初始化');
  }

  private async write(batches: TrackingImportBatch[]): Promise<void> {
    await writeFile(this.temporaryFile, `${JSON.stringify(batches, null, 2)}\n`, 'utf8');
    await rename(this.temporaryFile, this.stateFile);
  }
}

export async function confirmTrackingImportBatch(
  batch: TrackingImportBatch,
  service: PreauditService,
  selectedRows: number[],
  confirmedBy: string,
  confirmedAt: string,
): Promise<TrackingImportBatch> {
  if (batch.status === 'confirmed') return batch;
  const operator = confirmedBy.trim();
  if (!operator || selectedRows.length === 0) {
    throw new TrackingImportError('INVALID_IMPORT_SELECTION', '请选择可导入行并填写操作人');
  }
  const uniqueRows = [...new Set(selectedRows)];
  const rows = uniqueRows.map((rowNumber) => batch.preview.rows.find((row) => row.rowNumber === rowNumber));
  if (rows.some((row) => !row || row.matchStatus !== 'matched' || !row.projectId || !row.effectiveDate)) {
    throw new TrackingImportError('INVALID_IMPORT_SELECTION', '只能确认已匹配且校验通过的行');
  }

  const results: TrackingImportResult[] = [];
  for (const row of rows) {
    if (!row?.projectId || !row.effectiveDate) continue;
    const before = await service.getProject(row.projectId);
    const beforeCount = before.tracking?.snapshots.length ?? 0;
    const updated = await service.createTrackingSnapshot(row.projectId, {
      effectiveDate: row.effectiveDate,
      baseSnapshotId: before.tracking?.currentSnapshotId,
      values: row.values,
      source: 'excel_import',
      importBatchId: batch.id,
      createdBy: operator,
    });
    results.push({
      rowNumber: row.rowNumber,
      projectId: row.projectId,
      status: (updated.tracking?.snapshots.length ?? 0) === beforeCount ? 'already_imported' : 'imported',
    });
  }

  return {
    ...batch,
    status: 'confirmed',
    confirmedBy: operator,
    confirmedAt,
    results,
  };
}
