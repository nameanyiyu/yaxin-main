import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonResponse({ project: await (await getPreauditService()).getProject(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
