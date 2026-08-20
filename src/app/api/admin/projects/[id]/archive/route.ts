import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { externalReference?: unknown; note?: unknown };
    const service = await getPreauditService();
    const project = await service.archive(id, {
      externalReference: typeof body.externalReference === 'string' ? body.externalReference : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
