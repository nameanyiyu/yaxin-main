import { getPreauditService, getTemplateRegistry } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { PreauditServiceError } from '@/domain/preaudit/service';
import type { ProjectStatus } from '@/domain/preaudit/types';

export const runtime = 'nodejs';

const statuses = new Set<ProjectStatus>([
  'interviewing',
  'preaudit_needs_input',
  'pending_review',
  'reviewed',
  'pending_manual_submission',
  'pending_external_decision',
  'conditional_admission',
  'tracking',
  'rejected',
  'tracking_completed',
  'archived',
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get('status');
    if (rawStatus && !statuses.has(rawStatus as ProjectStatus)) {
      throw new PreauditServiceError('INVALID_STATUS_FILTER', '项目状态筛选值无效');
    }
    const service = await getPreauditService();
    const projects = await service.listProjects({
      status: rawStatus ? (rawStatus as ProjectStatus) : undefined,
      token: url.searchParams.get('token') || undefined,
    });
    return jsonResponse({ projects });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      contractName?: unknown;
      salesName?: unknown;
      templateId?: unknown;
      status?: unknown;
    };
    if (typeof body.templateId !== 'string') {
      throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '请选择审批模板');
    }
    const template = await (await getTemplateRegistry()).get(body.templateId);
    if (!template) throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '审批模板不存在');
    const status = typeof body.status === 'string' && statuses.has(body.status as ProjectStatus)
      ? body.status as ProjectStatus
      : 'interviewing';
    const project = await (await getPreauditService()).createAdminProject({
      contractName: typeof body.contractName === 'string' ? body.contractName : '',
      salesName: typeof body.salesName === 'string' ? body.salesName : '',
      token: template.token,
      templateVersion: template.version,
      status,
    });
    return jsonResponse({ project }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
