import { PREAUDIT_TEMPLATE_2025_11 } from './template-2025-11';
import { PREAUDIT_TEMPLATE_2026_08 } from './template-2026-08';
import type { FixedTemplateDefinition } from './types';

export const ACTIVE_TEMPLATE = PREAUDIT_TEMPLATE_2026_08;

export function getTemplateDefinition(input: { token?: string; version?: string } | string): FixedTemplateDefinition {
  const token = typeof input === 'string' ? input : input.token;
  const version = typeof input === 'string' ? undefined : input.version;
  if (token === PREAUDIT_TEMPLATE_2025_11.token || version === PREAUDIT_TEMPLATE_2025_11.version) return PREAUDIT_TEMPLATE_2025_11;
  if (token === PREAUDIT_TEMPLATE_2026_08.token || version === PREAUDIT_TEMPLATE_2026_08.version) return PREAUDIT_TEMPLATE_2026_08;
  return ACTIVE_TEMPLATE;
}

export { PREAUDIT_TEMPLATE_2025_11, PREAUDIT_TEMPLATE_2026_08 };
