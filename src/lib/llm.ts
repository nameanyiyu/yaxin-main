import { createOpenAI } from '@ai-sdk/openai';
import { getSettings } from './store';

export class LLMConfigurationError extends Error {
  readonly code = 'LLM_NOT_CONFIGURED';

  constructor(message: string) {
    super(message);
    this.name = 'LLMConfigurationError';
  }
}

function isPlaceholderApiKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized
    || normalized.includes('your-api-key')
    || normalized.includes('replace-me')
    || normalized === 'sk-xxx';
}

/**
 * 创建统一的 OpenAI 兼容客户端。
 * 从系统设置中动态获取 API 配置，而非只从环境变量。
 */
export function getLLMProvider() {
  const settings = getSettings();
  if (isPlaceholderApiKey(settings.llm.apiKey)) {
    throw new LLMConfigurationError('大模型 API Key 未配置，请联系管理员检查 LLM_API_KEY');
  }
  if (!settings.llm.apiBaseUrl.trim()) {
    throw new LLMConfigurationError('大模型 API 地址未配置，请联系管理员检查 LLM_API_BASE_URL');
  }
  const provider = createOpenAI({
    baseURL: settings.llm.apiBaseUrl,
    apiKey: settings.llm.apiKey,
  });
  return provider.chat;
}

/**
 * 获取默认模型名称
 */
export function getDefaultModel() {
  const model = getSettings().llm.model.trim();
  if (!model) throw new LLMConfigurationError('大模型名称未配置，请联系管理员检查 LLM_MODEL');
  return model;
}
