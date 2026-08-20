import { randomUUID } from 'node:crypto';
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from 'ai';
import { APP_CONFIG } from '@/config';
import { createPreauditAgent } from '@/domain/preaudit/agent';
import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import {
  assistantMessageText,
  createInterviewStreamTransform,
  createResilientInterviewStream,
  incomingMessageId,
  messageText,
  type IncomingMessage,
} from '@/domain/preaudit/chat-stream';
import { errorResponse } from '@/domain/preaudit/http';
import { applyFallbackSalesExtraction, fallbackSalesClarification } from '@/domain/preaudit/fallback-extraction';
import { toInterviewBatchPayload } from '@/domain/preaudit/interview-batches';
import { PreauditServiceError } from '@/domain/preaudit/service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: RouteContext<'/api/s/[token]/chat'>) {
  try {
    const { token } = await params;
    if (!await getTemplateByToken(token)) {
      throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    }
    const body = (await request.json()) as { messages?: unknown; projectId?: unknown };
    if (typeof body.projectId !== 'string' || !Array.isArray(body.messages)) {
      throw new PreauditServiceError('INVALID_CHAT_REQUEST', '缺少 projectId 或 messages');
    }
    const service = await getPreauditService();
    const project = await service.getProject(body.projectId);
    if (project.token !== token) {
      throw new PreauditServiceError('INVALID_CHAT_REQUEST', '项目不属于当前模板');
    }
    if (!['interviewing', 'preaudit_needs_input'].includes(project.status)) {
      throw new PreauditServiceError('INVALID_CHAT_REQUEST', '项目当前状态不能继续访谈');
    }

    const lastMessage = body.messages.at(-1) as IncomingMessage | undefined;
    const stableIncomingId = incomingMessageId(lastMessage ?? {}, randomUUID());
    if (lastMessage?.role === 'user') {
      const content = messageText(lastMessage);
      if (content) {
        await service.appendMessage(project.id, {
          id: stableIncomingId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        });
        await applyFallbackSalesExtraction(await service.getProject(project.id), content, service);
      }
    }

    let fallbackPersisted = false;
    const loadFallback = async () => {
      const latest = await service.getProject(project.id);
      const payload = toInterviewBatchPayload(latest);
      await service.recordInterviewBatch(project.id, payload.topicIds, payload.notifiedRiskIds);
      const clarification = lastMessage?.role === 'user' ? fallbackSalesClarification(messageText(lastMessage)) : undefined;
      return clarification ? `${clarification}\n\n${payload.message}` : payload.message;
    };
    const persistFallback = async (message: string) => {
      if (fallbackPersisted) return;
      fallbackPersisted = true;
      await service.appendMessage(project.id, {
        id: `fallback-${stableIncomingId}`,
        role: 'assistant',
        content: message,
        createdAt: new Date().toISOString(),
      });
    };

    try {
      const agent = await createPreauditAgent(project.id, service);
      const agentStream = await createAgentUIStream({
        agent,
        uiMessages: body.messages,
        timeout: { totalMs: APP_CONFIG.agent.requestTimeoutMs },
        experimental_transform: () => createInterviewStreamTransform(
          loadFallback,
          persistFallback,
        ),
        onFinish: async ({ responseMessage, isAborted }) => {
          if (isAborted || fallbackPersisted) return;
          const content = assistantMessageText(responseMessage);
          if (!content) return;
          await service.appendMessage(project.id, {
            id: responseMessage.id || randomUUID(),
            role: 'assistant',
            content,
            createdAt: new Date().toISOString(),
          });
        },
      });
      const resilientStream = createResilientInterviewStream(
        agentStream,
        loadFallback,
        persistFallback,
        stableIncomingId,
      );
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => writer.merge(resilientStream),
        }),
      });
    } catch {
      // Agent creation/initialization can fail before a readable stream exists.
      // Keep the interview moving with the same persisted, canonical batch.
      const fallbackMessage = await loadFallback();
      await persistFallback(fallbackMessage);
      const fallbackStream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          const id = `fallback-${stableIncomingId}`;
          controller.enqueue({ type: 'start', messageId: id });
          controller.enqueue({ type: 'text-start', id });
          controller.enqueue({ type: 'text-delta', id, delta: fallbackMessage });
          controller.enqueue({ type: 'text-end', id });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
          controller.close();
        },
      });
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => writer.merge(fallbackStream),
        }),
      });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
