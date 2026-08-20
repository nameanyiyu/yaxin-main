import { APP_CONFIG } from '@/config';

export function formatRecordingDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function mediaRecorderOptions(mimeType?: string): MediaRecorderOptions {
  return {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: APP_CONFIG.transcription.audioBitsPerSecond,
  };
}

export function shouldAutoStopRecording(elapsedSeconds: number): boolean {
  return elapsedSeconds >= APP_CONFIG.transcription.maxRecordingSeconds;
}
