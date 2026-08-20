import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { PreauditServiceError } from '@/domain/preaudit/service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!await getTemplateByToken(token)) {
      throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    }
    const body = (await request.json()) as { projectId?: unknown };
    if (typeof body.projectId !== 'string') {
      throw new PreauditServiceError('INVALID_PROJECT_ID', '缺少 projectId');
    }
    const service = await getPreauditService();
    const project = await service.getProject(body.projectId);
    if (project.token !== token) {
      throw new PreauditServiceError('INVALID_PROJECT_ID', '项目不属于当前模板');
    }
    return jsonResponse({ project: await service.prepareReview(project.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
