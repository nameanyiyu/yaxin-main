import { loadRiskConfiguration, saveRiskConfiguration } from '@/domain/preaudit/risk-config-store';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = await loadRiskConfiguration();
    return jsonResponse({ version: config.version, sourceDocument: config.sourceDocument, updatedAt: config.updatedAt, customerLists: config.customerLists });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { customerLists?: unknown };
    if (!Array.isArray(body.customerLists)) {
      return jsonResponse({ error: 'customerLists 必须是数组' }, 400);
    }
    const current = await loadRiskConfiguration();
    const config = await saveRiskConfiguration({ ...current, customerLists: body.customerLists });
    return jsonResponse({ version: config.version, sourceDocument: config.sourceDocument, updatedAt: config.updatedAt, customerLists: config.customerLists });
  } catch (error) {
    return errorResponse(error);
  }
}
