import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { ExternalApprovalError } from '@/domain/preaudit/external-approval';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import type { ApprovalDecision } from '@/domain/preaudit/types';

export const runtime = 'nodejs';

const decisions = new Set<ApprovalDecision>(['approved', 'rejected', 'conditional']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.decision !== 'string' || !decisions.has(body.decision as ApprovalDecision)) {
      throw new ExternalApprovalError('请选择有效的外部审批结果');
    }
    const project = await (await getPreauditService()).recordExternalApproval(id, {
      decision: body.decision as ApprovalDecision,
      decisionDate: typeof body.decisionDate === 'string' ? body.decisionDate : '',
      externalReference: typeof body.externalReference === 'string' ? body.externalReference : undefined,
      comments: typeof body.comments === 'string' ? body.comments : undefined,
      specialApprovalItems: typeof body.specialApprovalItems === 'string' ? body.specialApprovalItems : undefined,
      conditionalReason: typeof body.conditionalReason === 'string' ? body.conditionalReason : undefined,
      conditions: typeof body.conditions === 'string' ? body.conditions : undefined,
      recordedBy: typeof body.recordedBy === 'string' ? body.recordedBy : '',
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
