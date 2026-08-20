import { loadRiskConfiguration, saveRiskConfiguration } from '@/domain/preaudit/risk-config-store';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return jsonResponse(await loadRiskConfiguration());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    return jsonResponse(await saveRiskConfiguration(body));
  } catch (error) {
    return errorResponse(error);
  }
}
