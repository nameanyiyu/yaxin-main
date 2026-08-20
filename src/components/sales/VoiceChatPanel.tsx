'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { INTERVIEW_STAGES, PROJECT_INTRODUCTION_OUTLINE } from '@/domain/preaudit/interview-batches';
import type { PreauditProject } from '@/domain/preaudit/types';
import { formatRecordingDuration } from '@/lib/recording';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface Props {
  token: string;
  project: PreauditProject;
  onRequestReview: () => void;
  isPreparing: boolean;
  actionLabel?: string;
}

interface ToolPart {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

function isToolPart(value: unknown): value is ToolPart {
  return Boolean(value && typeof value === 'object' && 'type' in value && typeof (value as { type?: unknown }).type === 'string' && ((value as { type: string }).type.startsWith('tool-') || (value as { type: string }).type === 'dynamic-tool'));
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function toolLabel(part: ToolPart): { title: string; detail?: string } {
  const name = part.type === 'dynamic-tool' ? String(recordValue(part, 'toolName') ?? '') : part.type.slice(5);
  if (part.state === 'output-error') return { title: '本轮信息处理失败', detail: String(recordValue(part, 'errorText') ?? '') };
  if (name === 'askRiskFollowUp') return { title: '需要补充风险证据', detail: String(recordValue(part.input, 'question') ?? '') };
  if (name === 'extractProjectFields') {
    const keys = recordValue(part.output, 'acceptedKeys');
    const totalAnswered = recordValue(part.output, 'totalAnswered');
    const summary = typeof totalAnswered === 'number' ? `，项目累计已采集 ${totalAnswered} 项` : '';
    return {
      title: part.state === 'output-available' ? '本次回答已完成语义提取' : '正在理解语音并识别字段',
      detail: Array.isArray(keys) && keys.length
        ? `本次更新 ${keys.length} 项${summary}：${keys.join('、')}`
        : typeof totalAnswered === 'number'
          ? `本次没有新增明确字段，项目累计已采集 ${totalAnswered} 项`
          : undefined,
    };
  }
  if (name === 'evaluateProjectRisks') return { title: '风险规则已重新计算' };
  if (name === 'getNextInterviewBatch') return { title: '正在整理下一批缺项' };
  if (name === 'draftProjectNarratives') return { title: part.state === 'output-available' ? '项目说明草稿已保存' : '正在整理项目说明' };
  if (name === 'markReadyForReview') return { title: '完整性检查已完成' };
  return { title: '正在处理本轮回答' };
}

function initialMessages(project: PreauditProject): UIMessage[] {
  return project.messages.map((message) => ({ id: message.id, role: message.role, parts: [{ type: 'text', text: message.content }] }));
}

function visibleAssistantText(text: string): string {
  if (!/阶段\s*1\/5｜项目汇报/.test(text)) return text;
  return text.split('\n\n1. ')[0] ?? text;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export default function VoiceChatPanel({ token, project, onRequestReview, isPreparing, actionLabel = '查看当前阶段' }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: `/api/s/${token}/chat`, body: { projectId: project.id } }), [project.id, token]);
  const { messages, sendMessage, status, error: chatError, clearError } = useChat({ id: project.id, messages: initialMessages(project), transport });
  const sendTranscript = useCallback((text: string) => { void sendMessage({ text }); }, [sendMessage]);
  const speech = useSpeechRecognition(sendTranscript, { token, projectId: project.id });
  const isIntroductionRound = !messages.some((message) => message.role === 'user');
  const interviewProgress = useMemo(() => {
    const assistantTexts = messages
      .filter((message) => message.role === 'assistant')
      .map(messageText);
    const phaseStage = project.conversationState?.phase === 'commitments' ? 4 : 1;
    const complete = assistantTexts.some((text) => /阶段\s*5\/5｜完成送审/.test(text));
    const latestStage = assistantTexts
      .map((text) => text.match(/阶段\s*([1-5])\/5｜([^\n]+)/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .at(-1);
    const stage = complete ? 5 : Number(latestStage?.[1] ?? phaseStage);
    return {
      stage,
      label: complete ? '信息采集完成' : (latestStage?.[2]?.trim() || INTERVIEW_STAGES[stage - 1]?.label || '核心信息'),
      percent: complete ? 100 : stage * 20,
    };
  }, [messages, project.conversationState?.phase]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, speech.interimTranscript]);

  return (
    <div className="flex h-full flex-col bg-[var(--canvas)]">
      <section aria-label="访谈进度" className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className="font-bold text-[var(--ink)]">
              当前进度：阶段 {interviewProgress.stage}/5 · {interviewProgress.label}
            </p>
            <span className="font-semibold text-[var(--brand-strong)]">{interviewProgress.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={interviewProgress.percent}>
            <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500" style={{ width: `${interviewProgress.percent}%` }} />
          </div>
          <ol className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] text-[var(--muted)] sm:text-xs">
            {INTERVIEW_STAGES.map((stage) => (
              <li key={stage.id} className={stage.id <= interviewProgress.stage ? 'font-semibold text-[var(--brand-strong)]' : ''}>
                {stage.label}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((message) => (
            <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[88%]' : 'max-w-[92%]'}>
              <p className={`mb-1.5 text-xs font-medium ${message.role === 'user' ? 'text-right text-[var(--muted)]' : 'text-[var(--brand-strong)]'}`}>{message.role === 'user' ? '你' : '审批访谈助手'}</p>
              <div className={message.role === 'user' ? 'rounded-2xl rounded-br-md bg-[var(--brand)] px-4 py-3 text-[var(--surface)]' : 'rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)]'}>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') return <p key={index} className="whitespace-pre-wrap text-sm leading-7">{message.role === 'assistant' ? visibleAssistantText(part.text) : part.text}</p>;
                  if (isToolPart(part)) { const label = toolLabel(part); return <div key={index} className="my-2 border-t border-[var(--border)] pt-2 text-xs"><p className="font-medium text-[var(--ink)]">{label.title}</p>{label.detail && <p className="mt-1 leading-5 text-[var(--muted)]">{label.detail}</p>}</div>; }
                  return null;
                })}
              </div>
            </article>
          ))}
          {status === 'streaming' && <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]"><span className="h-2 w-2 rounded-full bg-[var(--brand)]" />正在整理回答并匹配审批表字段…</div>}
          {speech.isTranscribing && <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-2 text-xs text-[var(--brand-strong)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />录音已完成，正在识别文字…</div>}
          {speech.correctionApplied && <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-600" />已根据项目上下文完成语音文字纠错</div>}
          <div ref={endRef} />
        </div>
      </div>

      {(speech.error || chatError) && (
        <div role="alert" className="flex items-center justify-between gap-3 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>{speech.error ?? '对话请求失败，请检查网络或稍后重试。'}</span>
          {speech.hasPendingAudio ? (
            <button type="button" onClick={speech.retryTranscription} disabled={speech.isTranscribing} className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100 disabled:opacity-50">
              {speech.isTranscribing ? '重试中…' : '重试转录'}
            </button>
          ) : chatError ? (
            <button type="button" onClick={clearError} className="shrink-0 font-medium underline underline-offset-4">清除错误并继续</button>
          ) : null}
        </div>
      )}
      {!speech.isSupported && <p className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center text-xs text-[var(--danger)]">当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari。</p>}

      <div className="safe-bottom-ios border-t border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[0_-12px_32px_oklch(0.32_0.04_255/0.06)] md:py-5">
        {isIntroductionRound && (
          <section aria-labelledby="project-introduction-title" className="mx-auto mb-4 max-w-3xl rounded-2xl border border-[var(--brand)]/20 bg-[var(--brand-soft)] p-3 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <p id="project-introduction-title" className="text-sm font-bold text-[var(--brand-strong)]">介绍提纲</p>
              <span className="shrink-0 text-xs text-[var(--muted)]">建议一次说完</span>
            </div>
            <ol className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--ink)] sm:grid-cols-2">
              {PROJECT_INTRODUCTION_OUTLINE.map((item, index) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[10px] font-bold text-[var(--brand-strong)]">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <div className="relative grid h-28 w-28 place-items-center">
            {speech.isListening && (
              <>
                <span aria-hidden="true" className="voice-ring voice-ring-one absolute inset-2 rounded-full border border-[var(--danger)]/35" />
                <span aria-hidden="true" className="voice-ring voice-ring-two absolute inset-2 rounded-full border border-[var(--danger)]/25" />
              </>
            )}
            <button
              type="button"
              onClick={() => { if (speech.isListening) speech.stopListening(); else void speech.startListening(); }}
              disabled={!speech.isSupported || speech.isTranscribing || status !== 'ready'}
              aria-pressed={speech.isListening}
              aria-label={speech.isListening ? '结束录音' : '开始语音输入'}
              className={`relative z-10 grid h-24 w-24 place-items-center rounded-full text-[var(--surface)] shadow-[0_10px_28px_oklch(0.32_0.04_255/0.18)] focus-visible:outline-none disabled:cursor-not-allowed disabled:shadow-none ${
                speech.isListening
                  ? 'bg-[var(--danger)]'
                  : speech.isTranscribing || status !== 'ready'
                    ? 'bg-[var(--muted)]'
                    : 'bg-[var(--brand)] hover:bg-[var(--brand-strong)] active:scale-[0.97]'
              }`}
            >
              {speech.isTranscribing || status !== 'ready' ? (
                <svg className="h-9 w-9 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity=".28" strokeWidth="2" />
                  <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
              ) : speech.isListening ? (
                <span className="flex h-10 items-center gap-1" aria-hidden="true">
                  {[0.55, 0.85, 1, 0.7, 0.45].map((weight, index) => (
                    <span
                      key={index}
                      className="w-1.5 rounded-full bg-[var(--surface)] transition-[height] duration-75"
                      style={{ height: `${10 + Math.max(0.12, speech.audioLevel) * weight * 28}px` }}
                    />
                  ))}
                </span>
              ) : (
                <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="3.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M6.8 11.5a5.2 5.2 0 0 0 10.4 0M12 16.8v3.7m-3 0h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          </div>
          <p className={`mt-1 text-base font-bold ${speech.isListening ? 'text-[var(--danger)]' : 'text-[var(--ink)]'}`}>
            {speech.isListening
              ? '正在聆听'
              : speech.isTranscribing
                ? '正在识别语音'
                : status !== 'ready'
                  ? '正在整理回答'
                  : '点击开始讲述'}
          </p>
          <p className="mt-1 text-center text-xs text-[var(--muted)]">
            {speech.isListening
              ? `${formatRecordingDuration(speech.elapsedSeconds)} / ${formatRecordingDuration(speech.maxRecordingSeconds)}，完成后再次点击`
              : '识别完成后会自动发送；达到5分钟将自动结束录音'}
          </p>
          <span className="sr-only" role="status" aria-live="polite">
            {speech.isListening ? '录音中' : speech.isTranscribing ? '正在识别语音' : '可以开始录音'}
          </span>
        </div>
        <div className="mx-auto mt-3 flex max-w-3xl justify-center"><button type="button" onClick={onRequestReview} disabled={isPreparing || status === 'streaming'} className="text-xs font-medium text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--brand-strong)] disabled:opacity-50">{isPreparing ? '检查中…' : actionLabel}</button></div>
      </div>
    </div>
  );
}
