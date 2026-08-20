import { getPreauditService, getTemplateRegistry } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { TemplateRegistryError } from '@/domain/preaudit/template-registry';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: unknown; version?: unknown };
    const registry = await getTemplateRegistry();
    const template = await registry.update(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      version: typeof body.version === 'string' ? body.version : undefined,
    });
    return jsonResponse({ template });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const registry = await getTemplateRegistry();
    const template = await registry.get(id);
    if (!template) throw new TemplateRegistryError('TEMPLATE_NOT_FOUND', '审批模板不存在');
    const projects = await (await getPreauditService()).listProjects({ token: template.token });
    if (projects.length) {
      throw new TemplateRegistryError('TEMPLATE_IN_USE', `该模板已有 ${projects.length} 个项目，不能删除`);
    }
    await registry.delete(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
