import { describe, expect, it } from 'vitest';
import {
  assistantMessageText,
  createInterviewStreamTransform,
  createResilientInterviewStream,
  incomingMessageId,
  shouldForwardInterviewChunk,
} from '../chat-stream';
import { buildPreauditAgentInstructions } from '../agent';

describe('sales chat persistence', () => {
  async function transformedChunks(
    chunks: Array<Record<string, unknown>>,
    fallback = '阶段 1/5｜项目汇报\n请继续补充。',
  ): Promise<{ chunks: Array<Record<string, unknown>>; persisted: string[] }> {
    const persisted: string[] = [];
    const source = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const reader = source
      .pipeThrough(createInterviewStreamTransform(
        async () => fallback,
        async (message) => { persisted.push(message); },
      ))
      .getReader();
    const output: Array<Record<string, unknown>> = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      output.push(result.value as Record<string, unknown>);
    }
    return { chunks: output, persisted };
  }

  it('extracts finalized assistant text for resume history', () => {
    expect(assistantMessageText({
      role: 'assistant',
      parts: [
        { type: 'text', text: '已保存合同名称。' },
        { type: 'text', text: '请继续说明合同金额。' },
      ],
    })).toBe('已保存合同名称。\n请继续说明合同金额。');
  });

  it('suppresses model narration before the final interview batch', () => {
    let batchReady = false;
    const preamble = shouldForwardInterviewChunk(batchReady, { type: 'text-delta' });
    batchReady = preamble.batchReady;
    const batchResult = shouldForwardInterviewChunk(batchReady, {
      type: 'tool-result',
      toolName: 'getNextInterviewBatch',
      output: { message: '阶段 2/5｜信息确认\n请按编号一起回答：' },
    });
    batchReady = batchResult.batchReady;
    const modelRewrite = shouldForwardInterviewChunk(batchReady, { type: 'text-delta' });

    expect(preamble.forward).toBe(false);
    expect(batchResult.forward).toBe(true);
    expect(batchResult.canonicalMessage).toBe('阶段 2/5｜信息确认\n请按编号一起回答：');
    expect(modelRewrite.forward).toBe(false);
  });

  it('injects and persists a canonical fallback when the model stops after extraction', async () => {
    const result = await transformedChunks([
      { type: 'tool-result', toolName: 'extractProjectFields', output: { acceptedKeys: ['contractName'] } },
      { type: 'text-delta', text: '模型提前输出的内部说明' },
    ]);

    expect(result.persisted).toEqual(['阶段 1/5｜项目汇报\n请继续补充。']);
    expect(result.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-result', toolName: 'extractProjectFields' }),
      expect.objectContaining({ type: 'text-delta', text: '阶段 1/5｜项目汇报\n请继续补充。' }),
    ]));
    expect(result.chunks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '模型提前输出的内部说明' }),
    ]));
  });

  it('does not add a fallback when getNextInterviewBatch returns a canonical message', async () => {
    const result = await transformedChunks([
      {
        type: 'tool-result',
        toolName: 'getNextInterviewBatch',
        output: { message: '阶段 2/5｜信息确认' },
      },
    ]);

    expect(result.persisted).toEqual([]);
    expect(result.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text-delta', text: '阶段 2/5｜信息确认' }),
    ]));
  });

  it('persists and sends a fallback when the UI stream fails after saving the user message', async () => {
    const persisted: string[] = [];
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'start', messageId: 'assistant-1' });
        controller.error(new Error('provider stream closed'));
      },
    });
    const reader = createResilientInterviewStream(
      source,
      async () => '我已经记下前面的内容了，下面再确认一项。',
      async (message) => { persisted.push(message); },
      'user-1',
    ).getReader();
    const output: Array<Record<string, unknown>> = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      output.push(result.value as Record<string, unknown>);
    }

    expect(persisted).toEqual(['我已经记下前面的内容了，下面再确认一项。']);
    expect(output).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text-delta', delta: '我已经记下前面的内容了，下面再确认一项。' }),
      expect.objectContaining({ type: 'finish', finishReason: 'stop' }),
    ]));
    expect(output).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error' }),
    ]));
  });

  it('replaces an SDK error chunk with the next interview batch', async () => {
    const persisted: string[] = [];
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'start', messageId: 'assistant-2' });
        controller.enqueue({ type: 'error', errorText: 'An error occurred.' });
        controller.close();
      },
    });
    const reader = createResilientInterviewStream(
      source,
      async () => '这部分已经保存好了，我们继续确认下一项。',
      async (message) => { persisted.push(message); },
      'user-2',
    ).getReader();
    const output: Array<Record<string, unknown>> = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      output.push(result.value as Record<string, unknown>);
    }

    expect(persisted).toEqual(['这部分已经保存好了，我们继续确认下一项。']);
    expect(output.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(output.some((chunk) => chunk.delta === '这部分已经保存好了，我们继续确认下一项。')).toBe(true);
  });

  it('keeps the client message id stable for retry deduplication', () => {
    expect(incomingMessageId({ id: 'user-message-1' }, 'fallback-id')).toBe('user-message-1');
    expect(incomingMessageId({}, 'fallback-id')).toBe('fallback-id');
  });

  it('instructs the agent to scan the whole introduction without repeating saved fields', () => {
    const instructions = buildPreauditAgentInstructions(
      { salesName: '张三' },
      '- contractName｜合同名称',
      '- contractName: 智慧园区合同',
    );

    expect(instructions).toContain('扫描整段回答');
    expect(instructions).toContain('不限于当前问题');
    expect(instructions).toContain('不得重复追问已有事实');
    expect(instructions).toContain('没有固定轮数或次数上限');
    expect(instructions).toContain('GM1 12%”保存 12');
    expect(instructions).toContain('语音语义还原');
    expect(instructions).toContain('同音错字和错误断句');
    expect(instructions).toContain('不得只保存最明显的少数字段');
    expect(instructions).toContain('建设内容、业务场景、工期 → projectBackground');
    expect(instructions).toContain('付款比例、付款节点、验收、交付周期 → commercialTerms');
    expect(instructions).toContain('直签保存 direct');
    expect(instructions).toContain('AI识别标准');
    expect(instructions).toContain('不得因销售未提及而判定 clear');
    expect(instructions).toContain('AI 只判断是否触碰');
  });
});
