import { getOrganizationConfigRepository, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { PreauditServiceError } from '@/domain/preaudit/service';

export async function GET(_request: Request, { params }: RouteContext<'/api/s/[token]'>) {
  try {
    const { token } = await params;
    const template = await getTemplateByToken(token);
    if (!template) throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    const nodes = await (await getOrganizationConfigRepository()).list();
    const enabledIds = new Set(
      nodes.filter((node) => {
        if (!node.enabled) return false;
        if (!node.parentId) return true;
        const parent = nodes.find((candidate) => candidate.id === node.parentId);
        if (!parent?.enabled) return false;
        if (!parent.parentId) return true;
        return nodes.some((candidate) => candidate.id === parent.parentId && candidate.enabled);
      }).map((node) => node.id),
    );
    return jsonResponse({
      id: template.id,
      version: template.version,
      name: template.name,
      token: template.token,
      fields: template.fields.map((field) => ({
        key: field.key,
        label: field.label,
        section: field.section,
        type: field.type,
        required: field.required,
        requiredWhen: field.requiredWhen,
        question: field.question,
        guidance: field.guidance,
      })),
      organization: {
        bgs: nodes.filter((node) => node.type === 'bg' && enabledIds.has(node.id)),
        bus: nodes.filter((node) => node.type === 'bu' && enabledIds.has(node.id)),
        regions: nodes.filter((node) => node.type === 'region' && enabledIds.has(node.id)),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
