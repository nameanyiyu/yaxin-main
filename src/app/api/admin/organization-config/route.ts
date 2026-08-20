import { getOrganizationConfigRepository } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { OrganizationConfigError, type OrganizationNodeType } from '@/domain/preaudit/organization-config';

export const runtime = 'nodejs';

const nodeTypes = new Set<OrganizationNodeType>(['bg', 'bu', 'region']);

export async function GET() {
  try {
    const nodes = await (await getOrganizationConfigRepository()).list();
    return jsonResponse({ nodes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const repository = await getOrganizationConfigRepository();
    if (body.action === 'restore_defaults') {
      return jsonResponse({ nodes: await repository.restoreDefaults() });
    }
    if (typeof body.type !== 'string' || !nodeTypes.has(body.type as OrganizationNodeType)) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '组织配置类型无效');
    }
    const node = await repository.create({
      type: body.type as OrganizationNodeType,
      name: typeof body.name === 'string' ? body.name : '',
      parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return jsonResponse({ node }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
