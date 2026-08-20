import { ExcelTemplateError } from './excel-adapter';
import { ExternalApprovalError } from './external-approval';
import { TranscriptionServiceError } from '@/lib/transcription';
import { PreauditServiceError } from './service';
import { StatusTransitionError } from './state-machine';
import { TemplateRegistryError } from './template-registry';
import { TrackingImportError } from './tracking-imports';
import { TrackingServiceError } from './tracking-service';
import { TrackingWorkbookError } from './tracking-workbook';
import { OrganizationConfigError } from './organization-config';

interface ErrorShape {
  error: { code: string; message: string };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return jsonResponse({ error: { code: 'INVALID_JSON', message: '请求内容不是有效的 JSON' } } satisfies ErrorShape, 400);
  }
  if (error instanceof StatusTransitionError) {
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, 409);
  }
  if (error instanceof PreauditServiceError) {
    const status =
      error.code === 'PROJECT_NOT_FOUND'
        ? 404
        : ['INCOMPLETE_PROJECT', 'PROJECT_NOT_EXPORTABLE', 'PROJECT_NOT_EDITABLE', 'PROJECT_HAS_AUDIT_HISTORY'].includes(error.code)
          ? 409
          : 400;
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, status);
  }
  if (error instanceof ExternalApprovalError) {
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, 400);
  }
  if (error instanceof TrackingServiceError) {
    const status = error.code === 'TRACKING_CONFLICT' || error.code === 'TRACKING_NOT_AVAILABLE' ? 409 : 400;
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, status);
  }
  if (error instanceof OrganizationConfigError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } } satisfies ErrorShape,
      error.code === 'ORGANIZATION_CONFIG_NOT_FOUND' ? 404 : 400,
    );
  }
  if (error instanceof TrackingImportError) {
    const status = error.code === 'IMPORT_BATCH_NOT_FOUND' ? 404 : error.code === 'IMPORT_STATE_INVALID' ? 500 : 400;
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, status);
  }
  if (error instanceof TrackingWorkbookError) {
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, 409);
  }
  if (error instanceof ExcelTemplateError) {
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, 409);
  }
  if (error instanceof TranscriptionServiceError) {
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, error.status);
  }
  if (error instanceof TemplateRegistryError) {
    const status = error.code === 'TEMPLATE_NOT_FOUND'
      ? 404
      : ['TEMPLATE_TOKEN_EXISTS', 'BUILTIN_TEMPLATE_IMMUTABLE', 'TEMPLATE_IN_USE'].includes(error.code)
        ? 409
        : 400;
    return jsonResponse({ error: { code: error.code, message: error.message } } satisfies ErrorShape, status);
  }
  console.error('[Preaudit API]', error);
  return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' } } satisfies ErrorShape, 500);
}

export function methodNotAllowed(code: string, message: string): Response {
  return jsonResponse({ error: { code, message } } satisfies ErrorShape, 405);
}
