import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      reviewerName?: unknown;
      comments?: unknown;
      answerUpdates?: unknown;
    };
    const service = await getPreauditService();
    const project = await service.review(id, {
      reviewerName: typeof body.reviewerName === 'string' ? body.reviewerName : '',
      comments: typeof body.comments === 'string' ? body.comments : '',
      answerUpdates:
        body.answerUpdates && typeof body.answerUpdates === 'object' && !Array.isArray(body.answerUpdates)
          ? (body.answerUpdates as Record<string, unknown>)
          : undefined,
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
