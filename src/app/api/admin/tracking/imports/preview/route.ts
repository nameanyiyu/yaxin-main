import { randomUUID } from 'node:crypto';
import { getPreauditService, getTrackingImportRepository } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { TrackingImportError, type TrackingImportBatch } from '@/domain/preaudit/tracking-imports';
import { parseTrackingWorkbook } from '@/domain/preaudit/tracking-workbook';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const createdBy = String(form.get('createdBy') ?? '').trim();
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
      throw new TrackingImportError('INVALID_IMPORT_SELECTION', '请选择 .xlsx 项目跟踪工作簿');
    }
    if (!createdBy) throw new TrackingImportError('INVALID_IMPORT_SELECTION', '请填写导入操作人');
    const service = await getPreauditService();
    const preview = parseTrackingWorkbook(await file.arrayBuffer(), await service.listProjects());
    const now = new Date().toISOString();
    const batch: TrackingImportBatch = {
      id: randomUUID(),
      fileName: file.name,
      status: 'previewed',
      createdBy,
      createdAt: now,
      preview,
      results: [],
    };
    await (await getTrackingImportRepository()).save(batch);
    return jsonResponse({ batch });
  } catch (error) {
    return errorResponse(error);
  }
}
