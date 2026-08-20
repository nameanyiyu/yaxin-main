import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { TrackingServiceError } from '@/domain/preaudit/tracking-service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', 'values 必须是跟踪字段对象');
    }
    if (body.source !== undefined && !['manual', 'excel_import', 'migration'].includes(String(body.source))) {
      throw new TrackingServiceError('INVALID_TRACKING_INPUT', '跟踪记录来源无效');
    }
    const project = await (await getPreauditService()).createTrackingSnapshot(id, {
      effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : '',
      values: body.values as Record<string, unknown>,
      executionHealth: typeof body.executionHealth === 'string'
        ? body.executionHealth as 'normal' | 'breached' | 'at_risk'
        : undefined,
      executionHealthReason: typeof body.executionHealthReason === 'string'
        ? body.executionHealthReason
        : undefined,
      baseSnapshotId: typeof body.baseSnapshotId === 'string' ? body.baseSnapshotId : undefined,
      source: (body.source as 'manual' | 'excel_import' | 'migration' | undefined) ?? 'manual',
      importBatchId: typeof body.importBatchId === 'string' ? body.importBatchId : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : '',
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
