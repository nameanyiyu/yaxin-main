import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SystemSettings } from '@/types';

const environmentSettings: SystemSettings = {
  llm: {
    apiBaseUrl: process.env.LLM_API_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
  },
  transcription: {
    apiBaseUrl: process.env.TRANSCRIPTION_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.TRANSCRIPTION_MODEL || 'whisper-1',
    language: process.env.TRANSCRIPTION_LANGUAGE || 'zh-CN',
  },
};

function settingsFilePath() {
  const stateDirectory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
  return path.join(stateDirectory, 'system-settings.json');
}

function readPersistedSettings(): Partial<SystemSettings> {
  try {
    return JSON.parse(readFileSync(settingsFilePath(), 'utf8')) as Partial<SystemSettings>;
  } catch {
    return {};
  }
}

function currentSettings(): SystemSettings {
  const persisted = readPersistedSettings();
  return {
    ...environmentSettings,
    ...persisted,
    llm: { ...environmentSettings.llm, ...persisted.llm },
    transcription: { ...environmentSettings.transcription, ...persisted.transcription },
  };
}

export function getSettings(): SystemSettings {
  return structuredClone(currentSettings());
}

export function updateLLMSettings(input: Partial<SystemSettings['llm']>): SystemSettings {
  const nextSettings = currentSettings();
  nextSettings.llm = { ...nextSettings.llm, ...input };
  saveSettings(nextSettings);
  return nextSettings;
}

export function updateTranscriptionSettings(input: Partial<SystemSettings['transcription']>): SystemSettings {
  const nextSettings = currentSettings();
  nextSettings.transcription = { ...nextSettings.transcription, ...input };
  saveSettings(nextSettings);
  return nextSettings;
}

function saveSettings(nextSettings: SystemSettings) {
  const filePath = settingsFilePath();
  const temporaryFile = `${filePath}.tmp`;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(temporaryFile, `${JSON.stringify({ llm: nextSettings.llm, transcription: nextSettings.transcription }, null, 2)}\n`, 'utf8');
  renameSync(temporaryFile, filePath);
}
