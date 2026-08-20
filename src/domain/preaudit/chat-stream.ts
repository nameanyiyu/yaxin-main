import type { UIMessage, UIMessageChunk } from 'ai';

export interface IncomingMessage {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  parts?: unknown;
}

export function messageText(message: IncomingMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => {
        if (!part || typeof part !== 'object') return false;
        const candidate = part as { type?: unknown; text?: unknown };
        return candidate.type === 'text' && typeof candidate.text === 'string';
      })
      .map((part) => part.text)
      .join('\n');
  }
  return '';
}

export function assistantMessageText(message: Pick<UIMessage, 'role' | 'parts'>): string {
  if (message.role !== 'assistant') return '';
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function incomingMessageId(message: Pick<IncomingMessage, 'id'>, fallback: string): string {
  return typeof message.id === 'string' && message.id.trim() ? message.id : fallback;
}

export function shouldForwardInterviewChunk(
  batchReady: boolean,
  chunk: { type: string; toolName?: string; output?: unknown },
): { batchReady: boolean; forward: boolean; canonicalMessage?: string } {
  const isBatchResult = chunk.type === 'tool-result' && chunk.toolName === 'getNextInterviewBatch';
  const isTextChunk = ['text-start', 'text-delta', 'text-end'].includes(chunk.type);
  const output = isBatchResult && chunk.output && typeof chunk.output === 'object'
    ? chunk.output as { message?: unknown }
    : undefined;
  const canonicalMessage = typeof output?.message === 'string' ? output.message : undefined;
  return { batchReady: batchReady || Boolean(canonicalMessage), forward: !isTextChunk, canonicalMessage };
}

function enqueueCanonicalMessage(
  controller: TransformStreamDefaultController,
  message: string,
  id = 'canonical-interview-batch',
) {
  controller.enqueue({ type: 'text-start', id });
  controller.enqueue({ type: 'text-delta', id, text: message });
  controller.enqueue({ type: 'text-end', id });
}

export function createInterviewStreamTransform(
  loadFallback: () => Promise<string>,
  persistFallback?: (message: string) => Promise<void>,
) {
  let batchReady = false;
  return new TransformStream({
    transform(chunk, controller) {
      const decision = shouldForwardInterviewChunk(batchReady, chunk);
      batchReady = decision.batchReady;
      if (decision.forward) controller.enqueue(chunk);
      if (decision.canonicalMessage) enqueueCanonicalMessage(controller, decision.canonicalMessage);
    },
    async flush(controller) {
      if (batchReady) return;
      const message = await loadFallback();
      if (persistFallback) await persistFallback(message);
      enqueueCanonicalMessage(controller, message, 'fallback-interview-batch');
    },
  });
}

/**
 * Keeps a chat request usable when the model stream fails after the sales
 * message has already been saved. The SDK stream is intentionally wrapped at
 * the UI-message-chunk level so a provider error cannot leave the browser in
 * a half-finished interview turn.
 */
export function createResilientInterviewStream(
  source: ReadableStream<UIMessageChunk>,
  loadFallback: () => Promise<string>,
  persistFallback: (message: string) => Promise<void>,
  fallbackMessageId: string,
): ReadableStream<UIMessageChunk> {
  let fallbackPromise: Promise<string> | undefined;

  const getFallback = async () => {
    fallbackPromise ??= loadFallback();
    const message = await fallbackPromise;
    await persistFallback(message);
    return message;
  };

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const reader = source.getReader();
      let responseStarted = false;
      let responseFinished = false;
      let canonicalForwarded = false;
      let sourceReportedError = false;

      const enqueueFallback = async () => {
        if (canonicalForwarded) return;
        const message = await getFallback();
        const id = `fallback-${fallbackMessageId}`;
        if (!responseStarted) {
          controller.enqueue({ type: 'start', messageId: id });
          responseStarted = true;
        }
        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: message });
        controller.enqueue({ type: 'text-end', id });
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        responseFinished = true;
        canonicalForwarded = true;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value as UIMessageChunk & { id?: string };
          if (chunk.type === 'start') responseStarted = true;
          if (chunk.type === 'finish' || chunk.type === 'abort') responseFinished = true;
          if (chunk.type === 'error') {
            sourceReportedError = true;
            continue;
          }
          if (
            chunk.type === 'text-start'
            && (chunk.id === 'canonical-interview-batch' || chunk.id === 'fallback-interview-batch')
          ) {
            canonicalForwarded = true;
          }
          controller.enqueue(chunk);
        }

        if (sourceReportedError || (!responseFinished && !canonicalForwarded)) {
          await enqueueFallback();
        }
        if (!responseFinished && !canonicalForwarded) {
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
        }
        controller.close();
      } catch {
        await enqueueFallback();
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}
