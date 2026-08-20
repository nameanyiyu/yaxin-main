import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { answerProjectQuestion } from '@/domain/preaudit/project-qa';
import { PreauditServiceError } from '@/domain/preaudit/service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!await getTemplateByToken(token)) throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    const body = (await request.json()) as { projectId?: unknown; question?: unknown };
    if (typeof body.projectId !== 'string' || typeof body.question !== 'string') {
      throw new PreauditServiceError('INVALID_QA_REQUEST', '缺少 projectId 或 question');
    }
    const service = await getPreauditService();
    const project = await service.getProject(body.projectId);
    if (project.token !== token) throw new PreauditServiceError('INVALID_QA_REQUEST', '项目不属于当前模板');
    if (['interviewing', 'preaudit_needs_input'].includes(project.status)) {
      throw new PreauditServiceError('QA_NOT_AVAILABLE', '项目送后台复核后才能使用只读问答');
    }
    return jsonResponse({ answer: await answerProjectQuestion(project, body.question) });
  } catch (error) {
    return errorResponse(error);
  }
}
