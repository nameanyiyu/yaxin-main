'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { APP_CONFIG } from '@/config';
import { mediaRecorderOptions } from '@/lib/recording';

interface SpeechOptions {
  token: string;
  projectId: string;
}

const AUDIO_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

function subscribeBrowserSupport(): () => void {
  return () => undefined;
}

function browserSupportsRecording(): boolean {
  return Boolean(
    typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined',
  );
}

function preferredAudioType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '未获得麦克风权限，请在浏览器地址栏允许使用麦克风';
    if (error.name === 'NotFoundError') return '未检测到可用麦克风';
    if (error.name === 'NotReadableError') return '麦克风正被其他程序占用';
  }
  return '录音暂时无法启动，请检查麦克风后重试';
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { message?: string } };
    if (typeof body.error === 'string') return body.error;
    return body.error?.message ?? `语音转写失败（${response.status}）`;
  } catch {
    return `语音转写失败（${response.status}）`;
  }
}

export function useSpeechRecognition(
  onFinalTranscript: (text: string) => void,
  { token, projectId }: SpeechOptions,
) {
  const isSupported = useSyncExternalStore(
    subscribeBrowserSupport,
    browserSupportsRecording,
    () => false,
  );
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [correctionApplied, setCorrectionApplied] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAudioRef = useRef<Blob | null>(null);

  const releaseRecordingTimers = useCallback(() => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingIntervalRef.current = null;
    recordingTimeoutRef.current = null;
  }, []);

  const releaseAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
    setAudioLevel(0);
  }, []);

  const releaseStream = useCallback(() => {
    releaseRecordingTimers();
    releaseAudioAnalysis();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [releaseAudioAnalysis, releaseRecordingTimers]);

  const transcribe = useCallback(async (audio: Blob) => {
    pendingAudioRef.current = audio;
    setHasPendingAudio(true);
    setIsTranscribing(true);
    setError(null);
    try {
      const formData = new FormData();
      const extension = audio.type.startsWith('audio/mp4') ? 'm4a'
        : audio.type.startsWith('audio/ogg') ? 'ogg'
          : 'webm';
      formData.append('audio', audio, `recording.${extension}`);
      formData.append('projectId', projectId);
      const response = await fetch(`/api/s/${token}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { transcription?: unknown; correctionApplied?: unknown };
      const text = typeof body.transcription === 'string' ? body.transcription.trim() : '';
      if (!text) throw new Error('没有识别到有效语音，请靠近麦克风后重试');
      setCorrectionApplied(body.correctionApplied === true);
      setFinalTranscript(text);
      pendingAudioRef.current = null;
      setHasPendingAudio(false);
      onFinalTranscript(text);
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === 'TimeoutError'
        ? '上传或转写等待超时，录音已保留，可以直接重试'
        : reason instanceof Error
          ? reason.message
          : '语音转写失败，录音已保留，可以直接重试';
      setError(message);
    } finally {
      setIsTranscribing(false);
    }
  }, [onFinalTranscript, projectId, token]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      recorderRef.current = null;
      releaseStream();
      pendingAudioRef.current = null;
    };
  }, [releaseStream]);

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari');
      return;
    }
    if (!window.isSecureContext) {
      setError('浏览器只允许在 HTTPS 内网页面使用麦克风，请联系管理员启用 HTTPS');
      return;
    }

    setError(null);
    setFinalTranscript('');
    setCorrectionApplied(false);
    pendingAudioRef.current = null;
    setHasPendingAudio(false);
    setElapsedSeconds(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      const measureLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        setAudioLevel(Math.min(1, rms * 5.5));
        animationFrameRef.current = requestAnimationFrame(measureLevel);
      };
      measureLevel();
      const mimeType = preferredAudioType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mediaRecorderOptions(mimeType));
      } catch {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      }
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('录音过程中发生错误，请重新录制');
        setIsListening(false);
        releaseStream();
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        setIsListening(false);
        releaseStream();
        if (!chunks.length) {
          setError('没有录到声音，请重新录制');
          return;
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        void transcribe(audio);
      };
      recorder.start(250);
      const startedAt = Date.now();
      recordingIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.min(
          APP_CONFIG.transcription.maxRecordingSeconds,
          Math.floor((Date.now() - startedAt) / 1000),
        ));
      }, 250);
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, APP_CONFIG.transcription.maxRecordingSeconds * 1000);
      setIsListening(true);
    } catch (reason) {
      setError(microphoneError(reason));
      setIsListening(false);
      releaseStream();
    }
  }, [releaseStream, transcribe]);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const retryTranscription = useCallback(() => {
    const audio = pendingAudioRef.current;
    if (audio && !isTranscribing) void transcribe(audio);
  }, [isTranscribing, transcribe]);

  return {
    isListening,
    isTranscribing,
    isSupported,
    audioLevel,
    elapsedSeconds,
    maxRecordingSeconds: APP_CONFIG.transcription.maxRecordingSeconds,
    hasPendingAudio,
    interimTranscript: '',
    finalTranscript,
    correctionApplied,
    startListening,
    stopListening,
    retryTranscription,
    error,
  };
}
