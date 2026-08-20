import { getSettings, updateLLMSettings, updateTranscriptionSettings } from '@/lib/store';
import { jsonResponse, methodNotAllowed } from '@/domain/preaudit/http';

function masked(value: string): string {
  if (!value) return '';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function GET() {
  const settings = getSettings();
  return jsonResponse({
    llm: {
      apiBaseUrl: settings.llm.apiBaseUrl,
      apiKey: masked(settings.llm.apiKey),
      model: settings.llm.model,
    },
    transcription: {
      apiBaseUrl: settings.transcription.apiBaseUrl,
      apiKey: masked(settings.transcription.apiKey),
      model: settings.transcription.model,
      language: settings.transcription.language,
    },
    source: 'environment-or-local-file',
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { llm?: Record<string, unknown>; transcription?: Record<string, unknown> };
    const llm = body.llm;
    const transcription = body.transcription;
    if ((!llm || typeof llm !== 'object') && (!transcription || typeof transcription !== 'object')) {
      return jsonResponse({ error: { code: 'INVALID_SETTINGS', message: '配置不能为空' } }, 400);
    }

    let settings = getSettings();
    if (llm && typeof llm === 'object') {
      const apiBaseUrl = typeof llm.apiBaseUrl === 'string' ? llm.apiBaseUrl.trim() : '';
      const model = typeof llm.model === 'string' ? llm.model.trim() : '';
      const apiKey = typeof llm.apiKey === 'string' ? llm.apiKey.trim() : '';
      if (!apiBaseUrl || !model) {
        return jsonResponse({ error: { code: 'INVALID_SETTINGS', message: '大模型 API Base URL 和模型不能为空' } }, 400);
      }
      if (!isHttpUrl(apiBaseUrl)) {
        return jsonResponse({ error: { code: 'INVALID_SETTINGS', message: '大模型 API Base URL 格式不正确' } }, 400);
      }
      settings = updateLLMSettings({ apiBaseUrl, model, ...(apiKey ? { apiKey } : {}) });
    }

    if (transcription && typeof transcription === 'object') {
      const apiBaseUrl = typeof transcription.apiBaseUrl === 'string' ? transcription.apiBaseUrl.trim() : '';
      const model = typeof transcription.model === 'string' ? transcription.model.trim() : '';
      const language = typeof transcription.language === 'string' ? transcription.language.trim() : '';
      const apiKey = typeof transcription.apiKey === 'string' ? transcription.apiKey.trim() : '';
      if (!apiBaseUrl || !model || !language) {
        return jsonResponse({ error: { code: 'INVALID_SETTINGS', message: '语音转写 API Base URL、模型和语言不能为空' } }, 400);
      }
      if (!isHttpUrl(apiBaseUrl)) {
        return jsonResponse({ error: { code: 'INVALID_SETTINGS', message: '语音转写 API Base URL 格式不正确' } }, 400);
      }
      settings = updateTranscriptionSettings({ apiBaseUrl, model, language, ...(apiKey ? { apiKey } : {}) });
    }

    return jsonResponse({
      llm: { apiBaseUrl: settings.llm.apiBaseUrl, apiKey: masked(settings.llm.apiKey), model: settings.llm.model },
      transcription: {
        apiBaseUrl: settings.transcription.apiBaseUrl,
        apiKey: masked(settings.transcription.apiKey),
        model: settings.transcription.model,
        language: settings.transcription.language,
      },
      message: '大模型配置已保存',
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: { code: 'INVALID_JSON', message: '请求内容不是有效 JSON' } }, 400);
    }
    console.error('[Settings API]', error);
    return jsonResponse({ error: { code: 'SETTINGS_SAVE_FAILED', message: '大模型配置保存失败' } }, 500);
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export async function POST() {
  return methodNotAllowed('ENVIRONMENT_SETTINGS_ONLY', '请使用管理端配置保存服务设置；不支持通过 POST 修改运行时供应商');
}
