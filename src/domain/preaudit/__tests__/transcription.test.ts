import { describe, expect, it } from 'vitest';
import {
  ffmpegTranscriptionArgs,
  isSupportedAudioType,
  isRetryableTranscriptionStatus,
  normalizeAudioType,
  resolveTranscriptionEndpoint,
  resolveTranscriptionChatEndpoint,
  isDashScopeQwenAsrModel,
  isDashScopeRealtimeAudioModel,
  transcriptionModelForAttempt,
  shouldIncludeTranscriptionLanguage,
} from '@/lib/transcription';

describe('transcription endpoint', () => {
  it('uses an independently configured OpenAI-compatible audio endpoint', () => {
    expect(resolveTranscriptionEndpoint('https://api.siliconflow.cn/v1')).toBe(
      'https://api.siliconflow.cn/v1/audio/transcriptions',
    );
    expect(resolveTranscriptionEndpoint('https://api.siliconflow.cn/v1/')).toBe(
      'https://api.siliconflow.cn/v1/audio/transcriptions',
    );
  });

  it('uses chat completions for DashScope Qwen ASR models', () => {
    expect(resolveTranscriptionChatEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1/')).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    expect(isDashScopeQwenAsrModel('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3-asr-flash')).toBe(true);
    expect(isDashScopeRealtimeAudioModel('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-audio-3.0-realtime-flash')).toBe(true);
    expect(isDashScopeQwenAsrModel('https://api.siliconflow.cn/v1', 'qwen3-asr-flash')).toBe(false);
  });

  it('omits the unsupported language field for SiliconFlow SenseVoice', () => {
    expect(shouldIncludeTranscriptionLanguage('https://api.siliconflow.cn/v1')).toBe(false);
    expect(shouldIncludeTranscriptionLanguage('https://api.openai.com/v1')).toBe(true);
  });

  it('accepts MediaRecorder mime types that include codecs', () => {
    expect(normalizeAudioType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(isSupportedAudioType('audio/webm;codecs=opus')).toBe(true);
    expect(isSupportedAudioType('audio/ogg; codecs=opus')).toBe(true);
  });

  it('retries only transient upstream failures', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(isRetryableTranscriptionStatus(status)).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 413]) {
      expect(isRetryableTranscriptionStatus(status)).toBe(false);
    }
  });

  it('uses the fallback model on the final attempt', () => {
    expect(transcriptionModelForAttempt('SenseVoice', 'TeleSpeech', 0, 3)).toBe('SenseVoice');
    expect(transcriptionModelForAttempt('SenseVoice', 'TeleSpeech', 1, 3)).toBe('SenseVoice');
    expect(transcriptionModelForAttempt('SenseVoice', 'TeleSpeech', 2, 3)).toBe('TeleSpeech');
    expect(transcriptionModelForAttempt('SenseVoice', '', 2, 3)).toBe('SenseVoice');
  });

  it('normalizes upstream audio to 16kHz mono MP3 at a controlled bitrate', () => {
    const args = ffmpegTranscriptionArgs('/tmp/input.webm', '/tmp/output.mp3');

    expect(args).toEqual(expect.arrayContaining([
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '32k',
      '-codec:a', 'libmp3lame',
    ]));
  });
});
