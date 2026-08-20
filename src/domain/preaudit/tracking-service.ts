import { createHash } from 'node:crypto';
import {
  isSupplierTrackingApplicable,
  TRACKING_FIELD_BY_KEY,
  trackingFieldOwnership,
} from './tracking-fields';
import type {
  PreauditProject,
  CompletionOutcome,
  ExecutionHealth,
  ProjectTrackingSnapshot,
  TrackingFieldValue,
} from './types';

export class TrackingServiceError extends Error {
  constructor(
    readonly code: 'INVALID_TRACKING_INPUT' | 'TRACKING_CONFLICT' | 'TRACKING_NOT_AVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'TrackingServiceError';
  }
}

export interface CreateTrackingSnapshotInput {
  effectiveDate: string;
  values: Record<string, unknown>;
  executionHealth?: ExecutionHealth;
  executionHealthReason?: string;
  baseSnapshotId?: string;
  source: 'manual' | 'excel_import' | 'migration';
  importBatchId?: string;
  note?: string;
  createdBy: string;
}

export interface CompleteTrackingInput {
  completedBy: string;
  note: string;
  completionOutcome: CompletionOutcome;
  completionOutcomeReason?: string;
}

function required(value: string | undefined, message: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new TrackingServiceError('INVALID_TRACKING_INPUT', message);
  return normalized;
}

function normalizedUpdates(
  project: PreauditProject,
  values: Record<string, unknown>,
): Record<string, TrackingFieldValue> {
  const result: Record<string, TrackingFieldValue> = {};
  for (const [key, rawValue] of Object.entries(values)) {
    const field = TRACKING_FIELD_BY_KEY.get(key);
    if (!field || trackingFieldOwnership(field) !== 'snapshot') {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', `未知或不可编辑的跟踪字段 ${key}`);
    }
    if (field.section === 'procurement' && !isSupplierTrackingApplicable(project)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', '当前项目不涉及采购，不能填写供应商跟踪字段');
    }
    if (rawValue === undefined || rawValue === '') continue;
    if (rawValue === '#CLEAR') {
      result[key] = null;
      continue;
    }
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', `字段 ${field.label} 的值无效`);
    }
    if (typeof rawValue === 'number' && !Number.isFinite(rawValue)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', `字段 ${field.label} 的值无效`);
    }
    if (field.type === 'percentage' && typeof rawValue === 'number' && (rawValue < 0 || rawValue > 100)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', `字段 ${field.label} 必须在 0 到 100 之间`);
    }
    if (field.options && !field.options.some((option) => option.value === rawValue)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', `字段 ${field.label} 的选项无效`);
    }
    result[key] = typeof rawValue === 'string' ? rawValue.trim() : rawValue as number | boolean;
  }
  return result;
}

function canonicalJson(values: Record<string, TrackingFieldValue>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))));
}

export function trackingFingerprint(
  projectId: string,
  effectiveDate: string,
  values: Record<string, TrackingFieldValue>,
  executionHealth?: ExecutionHealth,
  executionHealthReason?: string,
): string {
  return createHash('sha256')
    .update(`${projectId}\n${effectiveDate}\n${canonicalJson(values)}\n${executionHealth ?? ''}\n${executionHealthReason ?? ''}`)
    .digest('hex');
}

export function buildTrackingSnapshot(
  project: PreauditProject,
  input: CreateTrackingSnapshotInput,
  snapshotId: string,
  now: string,
): { snapshot?: ProjectTrackingSnapshot; duplicate: boolean } {
  if (project.status !== 'tracking' || !project.tracking || project.tracking.status === 'completed') {
    throw new TrackingServiceError('TRACKING_NOT_AVAILABLE', '当前项目尚未进入可跟踪状态');
  }
  const effectiveDate = required(input.effectiveDate, '请填写本期跟踪日期');
  const createdBy = required(input.createdBy, '请填写跟踪记录人');
  const executionHealth = input.executionHealth;
  const executionHealthReason = input.executionHealthReason?.trim() || undefined;
  if (input.source === 'manual' && !executionHealth) {
    throw new TrackingServiceError('INVALID_TRACKING_INPUT', '请选择本期执行状态');
  }
  if (executionHealth && !['normal', 'breached', 'at_risk'].includes(executionHealth)) {
    throw new TrackingServiceError('INVALID_TRACKING_INPUT', '本期执行状态无效');
  }
  if (['breached', 'at_risk'].includes(executionHealth ?? '') && !executionHealthReason) {
    throw new TrackingServiceError(
      'INVALID_TRACKING_INPUT',
      '高风险预警或明确承诺未达成时，请填写执行状态说明',
    );
  }
  const current = project.tracking.snapshots.find(
    (snapshot) => snapshot.id === project.tracking?.currentSnapshotId,
  );
  const values = {
    ...(current?.values ?? {}),
    ...normalizedUpdates(project, input.values),
  };
  const contentFingerprint = trackingFingerprint(
    project.id,
    effectiveDate,
    values,
    executionHealth,
    executionHealthReason,
  );
  if (project.tracking.snapshots.some((snapshot) => snapshot.contentFingerprint === contentFingerprint)) {
    return { duplicate: true };
  }
  if (current && input.baseSnapshotId !== current.id) {
    throw new TrackingServiceError('TRACKING_CONFLICT', '项目跟踪记录已被他人更新，请刷新后重试');
  }
  return {
    duplicate: false,
    snapshot: {
      id: snapshotId,
      effectiveDate,
      source: input.source,
      executionHealth,
      executionHealthReason,
      values,
      importBatchId: input.importBatchId?.trim() || undefined,
      contentFingerprint,
      note: input.note?.trim() || undefined,
      createdBy,
      createdAt: now,
    },
  };
}
