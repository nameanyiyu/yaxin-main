import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { toInterviewBatchPayload } from '@/domain/preaudit/interview-batches';
import { presentSalesReview } from '@/domain/preaudit/presentation';
import { PreauditServiceError } from '@/domain/preaudit/service';

export const runtime = 'nodejs';

async function projectForToken(token: string, projectId: string) {
  if (!await getTemplateByToken(token)) {
    throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
  }
  const service = await getPreauditService();
  const project = await service.getProject(projectId);
  if (project.token !== token) throw new PreauditServiceError('INVALID_PROJECT_ID', '项目不属于当前模板');
  return { service, project };
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) throw new PreauditServiceError('INVALID_PROJECT_ID', '缺少 projectId');
    const { project } = await projectForToken(token, projectId);
    return jsonResponse({ project, summary: presentSalesReview(project), flow: toInterviewBatchPayload(project) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json()) as { projectId?: unknown; action?: unknown };
    if (typeof body.projectId !== 'string') throw new PreauditServiceError('INVALID_PROJECT_ID', '缺少 projectId');
    const { service } = await projectForToken(token, body.projectId);
    const project = body.action === 'confirm_summary'
      ? await service.confirmReportSummary(body.projectId)
      : body.action === 'acknowledge_risks'
        ? await service.acknowledgeRisks(body.projectId)
        : undefined;
    if (!project) throw new PreauditServiceError('INVALID_WORKFLOW_ACTION', '不支持的流程操作');
    return jsonResponse({ project, summary: presentSalesReview(project), flow: toInterviewBatchPayload(project) });
  } catch (error) {
    return errorResponse(error);
  }
}
