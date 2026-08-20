import { getOrganizationConfigRepository } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const node = await (await getOrganizationConfigRepository()).update(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return jsonResponse({ node });
  } catch (error) {
    return errorResponse(error);
  }
}
