import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getSettings } from './store';
import { APP_CONFIG } from '@/config';

const MAX_FILE_SIZE = APP_CONFIG.transcription.maxFileSize;

export class TranscriptionServiceError extends Error {
  constructor(
    public readonly code: 'TRANSCRIPTION_TIMEOUT' | 'TRANSCRIPTION_UPSTREAM_ERROR' | 'TRANSCRIPTION_INVALID_RESPONSE',
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TranscriptionServiceError';
  }
}

export function normalizeAudioType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function isSupportedAudioType(mimeType: string): boolean {
  return APP_CONFIG.transcription.supportedAudioTypes.includes(normalizeAudioType(mimeType));
}

export function isFileSizeValid(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

export function resolveTranscriptionEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
}

export function resolveTranscriptionChatEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export function isDashScopeQwenAsrModel(apiBaseUrl: string, model: string): boolean {
  try {
    const hostname = new URL(apiBaseUrl).hostname;
    return (hostname === 'dashscope.aliyuncs.com' || hostname.endsWith('.maas.aliyuncs.com'))
      && /^qwen3-asr-flash(?:-|$)/i.test(model.trim());
  } catch {
    return false;
  }
}

export function isDashScopeRealtimeAudioModel(apiBaseUrl: string, model: string): boolean {
  try {
    const hostname = new URL(apiBaseUrl).hostname;
    return (hostname === 'dashscope.aliyuncs.com' || hostname.endsWith('.maas.aliyuncs.com'))
      && /qwen-audio.*realtime/i.test(model);
  } catch {
    return false;
  }
}

export function shouldIncludeTranscriptionLanguage(apiBaseUrl: string): boolean {
  return !new URL(apiBaseUrl).hostname.endsWith('siliconflow.cn');
}

export function isRetryableTranscriptionStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function transcriptionModelForAttempt(
  primaryModel: string,
  fallbackModel: string,
  attempt: number,
  maxAttempts: number,
): string {
  return fallbackModel && attempt === maxAttempts - 1 ? fallbackModel : primaryModel;
}

export function ffmpegTranscriptionArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-codec:a', 'libmp3lame',
    '-b:a', '32k',
    outputPath,
  ];
}

function audioExtension(mimeType: string): string {
  const normalized = normalizeAudioType(mimeType);
  const extMap: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'mp4',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };
  return extMap[normalized] || 'webm';
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/env', ['ffmpeg', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 4_000) stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function normalizeAudioForUpstream(
  audioBuffer: ArrayBuffer,
  mimeType: string,
): Promise<{ buffer: ArrayBuffer; mimeType: string; fileName: string }> {
  const original = {
    buffer: audioBuffer,
    mimeType: normalizeAudioType(mimeType) || 'audio/webm',
    fileName: `audio.${audioExtension(mimeType)}`,
  };
  if (process.env.TRANSCRIPTION_NORMALIZE_AUDIO === 'false') return original;

  const directory = await mkdtemp(path.join(/* turbopackIgnore: true */ tmpdir(), 'preaudit-asr-'));
  const inputPath = path.join(/* turbopackIgnore: true */ directory, `${randomUUID()}.${audioExtension(mimeType)}`);
  const outputPath = path.join(/* turbopackIgnore: true */ directory, `${randomUUID()}.mp3`);
  try {
    await writeFile(inputPath, new Uint8Array(audioBuffer));
    await runFfmpeg(ffmpegTranscriptionArgs(inputPath, outputPath));
    const output = await readFile(outputPath);
    const normalized = output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    ) as ArrayBuffer;
    return { buffer: normalized, mimeType: 'audio/mpeg', fileName: 'audio.mp3' };
  } catch (error) {
    console.warn('[Transcription] FFmpeg normalization skipped:', error instanceof Error ? error.message : error);
    return original;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestTranscription(
  audio: { buffer: ArrayBuffer; mimeType: string; fileName: string },
  model: string,
  attempt: number,
): Promise<Response> {
  const settings = getSettings();
  const useDashScopeQwenAsr = isDashScopeQwenAsrModel(settings.transcription.apiBaseUrl, model);
  const headers: HeadersInit = { Authorization: `Bearer ${settings.transcription.apiKey}` };
  let endpoint = resolveTranscriptionEndpoint(settings.transcription.apiBaseUrl);
  let body: BodyInit;
  if (useDashScopeQwenAsr) {
    const dataUri = `data:${audio.mimeType};base64,${Buffer.from(audio.buffer).toString('base64')}`;
    endpoint = resolveTranscriptionChatEndpoint(settings.transcription.apiBaseUrl);
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: dataUri } }],
      }],
      stream: false,
      asr_options: { language: settings.transcription.language || 'zh' },
    });
  } else {
    const formData = new FormData();
    formData.append('file', new Blob([audio.buffer], { type: audio.mimeType }), audio.fileName);
    formData.append('model', model);
    if (shouldIncludeTranscriptionLanguage(settings.transcription.apiBaseUrl)) {
      formData.append('language', settings.transcription.language || 'zh');
    }
    body = formData;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_CONFIG.transcription.requestTimeoutMs);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TranscriptionServiceError(
        'TRANSCRIPTION_TIMEOUT',
        `语音转写请求超时，正在进行第 ${attempt + 1} 次容错处理`,
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function transcribeAudio(audioBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const settings = getSettings();
  const apiKey = settings.transcription.apiKey;

  if (!apiKey) {
    throw new Error('未配置语音转写 API Key，请在系统设置中配置转录服务');
  }

  const normalizedAudio = await normalizeAudioForUpstream(audioBuffer, mimeType);
  const primaryModel = settings.transcription.model || 'whisper-1';
  if (isDashScopeRealtimeAudioModel(settings.transcription.apiBaseUrl, primaryModel)) {
    throw new TranscriptionServiceError(
      'TRANSCRIPTION_UPSTREAM_ERROR',
      '当前语音模型仅支持 WebSocket 实时接口，请改用 qwen3-asr-flash 或 OpenAI 兼容的文件转写模型',
      400,
    );
  }
  const isDashScopeQwenAsr = isDashScopeQwenAsrModel(settings.transcription.apiBaseUrl, primaryModel);
  const fallbackModel = isDashScopeQwenAsr
    ? ''
    : process.env.TRANSCRIPTION_FALLBACK_MODEL || APP_CONFIG.transcription.fallbackModel;
  let lastError: unknown;

  for (let attempt = 0; attempt < APP_CONFIG.transcription.maxAttempts; attempt += 1) {
    const model = transcriptionModelForAttempt(
      primaryModel,
      fallbackModel,
      attempt,
      APP_CONFIG.transcription.maxAttempts,
    );
    try {
      const response = await requestTranscription(normalizedAudio, model, attempt);
      const traceId = response.headers.get('x-siliconcloud-trace-id') || 'unavailable';
      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 500);
        console.warn('[Transcription] upstream rejected request', {
          attempt: attempt + 1,
          model,
          status: response.status,
          traceId,
        });
        if (isRetryableTranscriptionStatus(response.status) && attempt + 1 < APP_CONFIG.transcription.maxAttempts) {
          lastError = new Error(errorText);
          await wait(APP_CONFIG.transcription.retryBaseDelayMs * 2 ** attempt);
          continue;
        }
        throw new TranscriptionServiceError(
          'TRANSCRIPTION_UPSTREAM_ERROR',
          response.status === 401 || response.status === 403
            ? '语音转写服务鉴权失败，请联系管理员检查 API Key'
            : `语音转写服务暂时不可用（${response.status}，追踪号 ${traceId}）`,
          response.status >= 500 ? 502 : response.status,
        );
      }

      const data = (await response.json()) as {
        text?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const text = isDashScopeQwenAsr
        ? data.choices?.[0]?.message?.content
        : data.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new TranscriptionServiceError(
          'TRANSCRIPTION_INVALID_RESPONSE',
          '语音转写服务未返回有效文字，请重新录制',
          502,
        );
      }
      return text.trim();
    } catch (error) {
      lastError = error;
      const nonRetryable = error instanceof TranscriptionServiceError
        && error.code !== 'TRANSCRIPTION_TIMEOUT';
      if (nonRetryable || attempt + 1 >= APP_CONFIG.transcription.maxAttempts) break;
      console.warn('[Transcription] transient request failure', {
        attempt: attempt + 1,
        model,
        reason: error instanceof Error ? error.name : 'unknown',
      });
      await wait(APP_CONFIG.transcription.retryBaseDelayMs * 2 ** attempt);
    }
  }

  if (lastError instanceof TranscriptionServiceError) {
    throw new TranscriptionServiceError(
      lastError.code,
      lastError.code === 'TRANSCRIPTION_TIMEOUT'
        ? '语音转写多次请求超时，请稍后重试，录音仍保留在当前页面'
        : lastError.message,
      lastError.status,
    );
  }
  throw new TranscriptionServiceError(
    'TRANSCRIPTION_UPSTREAM_ERROR',
    '语音转写网络连接失败，请稍后重试，录音仍保留在当前页面',
    502,
  );
}
