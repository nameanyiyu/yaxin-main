import { describe, expect, it } from 'vitest';
import {
  formatRecordingDuration,
  mediaRecorderOptions,
  shouldAutoStopRecording,
} from '@/lib/recording';

describe('voice recording resilience', () => {
  it('formats the recording countdown for the voice-first UI', () => {
    expect(formatRecordingDuration(0)).toBe('00:00');
    expect(formatRecordingDuration(65)).toBe('01:05');
    expect(formatRecordingDuration(300)).toBe('05:00');
  });

  it('requests a controlled compressed audio bitrate', () => {
    expect(mediaRecorderOptions('audio/webm;codecs=opus')).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32_000,
    });
  });

  it('automatically stops recordings at the configured limit', () => {
    expect(shouldAutoStopRecording(299)).toBe(false);
    expect(shouldAutoStopRecording(300)).toBe(true);
  });
});
