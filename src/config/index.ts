export const APP_CONFIG = {
  name: '亚信科技域外合同前置审批语音 AI 助手',
  version: '2.0.0',
  company: '亚信科技',

  excel: {
    maxFileSize: 10 * 1024 * 1024,
    supportedFormats: ['.xlsx', '.xls'],
    maxColumns: 100,
    sampleRows: 5,
  },

  agent: {
    maxSteps: 50,
    maxQuestionsPerTurn: 2,
    confidenceThreshold: 0.55,
    requestTimeoutMs: 30_000,
  },

  speech: {
    language: 'zh-CN',
    continuous: false,
    interimResults: true,
  },

  transcription: {
    maxFileSize: 25 * 1024 * 1024,
    maxRecordingSeconds: 5 * 60,
    audioBitsPerSecond: 32_000,
    requestTimeoutMs: 90_000,
    maxAttempts: 3,
    retryBaseDelayMs: 800,
    fallbackModel: 'TeleAI/TeleSpeechASR',
    supportedAudioTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/flac'],
    model: 'whisper-1',
  },
};
