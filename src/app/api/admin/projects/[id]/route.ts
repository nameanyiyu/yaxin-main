import { getPreauditService } from '@/domain/preaudit/bootstrap';
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const service = await getPreauditService();
    return jsonResponse({ project: await service.getProject(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      values?: unknown;
      meta?: { contractName?: unknown; salesName?: unknown; status?: unknown };
    };
    const service = await getPreauditService();
    let project = await service.getProject(id);
    if (body.meta) {
      const status = typeof body.meta.status === 'string'
        ? body.meta.status as ProjectStatus
        : undefined;
      if (status && !statuses.has(status)) {
        throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '项目状态无效');
      }
      project = await service.updateAdminProject(id, {
        contractName: typeof body.meta.contractName === 'string' ? body.meta.contractName : undefined,
        salesName: typeof body.meta.salesName === 'string' ? body.meta.salesName : undefined,
        status,
      });
    }
    if (body.values !== undefined) {
      if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
        throw new PreauditServiceError('INVALID_FIELD_VALUE', 'values 必须是字段对象');
      }
      project = await service.updateAnswers(id, body.values as Record<string, unknown>, 'reviewer');
    }
    if (!body.meta && body.values === undefined) {
      throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '没有可更新的项目内容');
    }
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await (await getPreauditService()).deleteProject(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
