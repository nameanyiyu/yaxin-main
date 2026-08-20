import { randomUUID } from 'node:crypto';
import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { applyFallbackSalesExtraction } from '@/domain/preaudit/fallback-extraction';
import {
  formatInterviewBatch,
  getInterviewBatch,
  hasBatchedInterviewStarted,
  interviewBatchMatchesMessage,
  toInterviewBatchPayload,
} from '@/domain/preaudit/interview-batches';
import { PreauditServiceError } from '@/domain/preaudit/service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: RouteContext<'/api/s/[token]/start'>) {
  try {
    const { token } = await params;
    const template = await getTemplateByToken(token);
    if (!template) throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    const body = (await request.json()) as {
      salesName?: unknown;
      salesBu?: unknown;
      salesRegion?: unknown;
      opportunitySerialNumber?: unknown;
      startMode?: unknown;
    };
    const service = await getPreauditService();
    const result = await service.startProject(
      token,
      typeof body.salesName === 'string' ? body.salesName : '',
      template,
      {
        salesBu: typeof body.salesBu === 'string' ? body.salesBu : '',
        salesRegion: typeof body.salesRegion === 'string' ? body.salesRegion : '',
        opportunitySerialNumber: typeof body.opportunitySerialNumber === 'string'
          ? body.opportunitySerialNumber
          : undefined,
        startMode: body.startMode === 'new' ? 'new' : 'resume',
      },
    );
    const latestUserMessage = [...result.project.messages].reverse().find((message) => message.role === 'user');
    if (['interviewing', 'preaudit_needs_input'].includes(result.project.status) && latestUserMessage?.content) {
      result.project = await applyFallbackSalesExtraction(result.project, latestUserMessage.content, service);
    }
    const interviewStarted = hasBatchedInterviewStarted(result.project);
    const interruptedAfterSalesAnswer = interviewStarted
      && result.project.messages.at(-1)?.role === 'user';
    const nextBatch = getInterviewBatch(result.project);
    const lastAssistant = [...result.project.messages].reverse().find((message) => message.role === 'assistant');
    const staleAssistantBatch = interviewStarted
      && Boolean(lastAssistant)
      && !interviewBatchMatchesMessage(nextBatch, lastAssistant?.content ?? '');
    if (!interviewStarted || interruptedAfterSalesAnswer || staleAssistantBatch) {
      const payload = toInterviewBatchPayload(result.project);
      await service.recordInterviewBatch(result.project.id, payload.topicIds, payload.notifiedRiskIds);
      await service.appendMessage(result.project.id, {
        id: randomUUID(),
        role: 'assistant',
        content: formatInterviewBatch(nextBatch, result.project.salesName),
        createdAt: new Date().toISOString(),
      });
      result.project = await service.getProject(result.project.id);
    }
    return jsonResponse({ project: result.project, resumed: result.resumed });
  } catch (error) {
    return errorResponse(error);
  }
}
