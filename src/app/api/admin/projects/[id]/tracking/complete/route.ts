import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const project = await (await getPreauditService()).completeTracking(id, {
      completedBy: typeof body.completedBy === 'string' ? body.completedBy : '',
      note: typeof body.note === 'string' ? body.note : '',
      completionOutcome: typeof body.completionOutcome === 'string'
        ? body.completionOutcome as 'achieved' | 'not_achieved'
        : '' as 'achieved',
      completionOutcomeReason: typeof body.completionOutcomeReason === 'string'
        ? body.completionOutcomeReason
        : undefined,
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
