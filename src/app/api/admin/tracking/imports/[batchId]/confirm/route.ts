import { getPreauditService, getTrackingImportRepository } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { confirmTrackingImportBatch, TrackingImportError } from '@/domain/preaudit/tracking-imports';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (!Array.isArray(body.rowNumbers) || !body.rowNumbers.every((value) => Number.isInteger(value))) {
      throw new TrackingImportError('INVALID_IMPORT_SELECTION', '请选择有效的导入行');
    }
    const repository = await getTrackingImportRepository();
    const batch = await confirmTrackingImportBatch(
      await repository.get(batchId),
      await getPreauditService(),
      body.rowNumbers as number[],
      typeof body.confirmedBy === 'string' ? body.confirmedBy : '',
      new Date().toISOString(),
    );
    await repository.save(batch);
    return jsonResponse({ batch });
  } catch (error) {
    return errorResponse(error);
  }
}
