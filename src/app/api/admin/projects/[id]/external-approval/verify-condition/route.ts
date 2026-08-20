import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { ExternalApprovalError } from '@/domain/preaudit/external-approval';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (body.result !== 'fulfilled' && body.result !== 'failed') {
      throw new ExternalApprovalError('请选择有效的准入条件核验结果');
    }
    const project = await (await getPreauditService()).verifyAdmissionCondition(id, {
      result: body.result,
      comments: typeof body.comments === 'string' ? body.comments : '',
      verifiedBy: typeof body.verifiedBy === 'string' ? body.verifiedBy : '',
    });
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
