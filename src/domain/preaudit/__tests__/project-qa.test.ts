import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRiskConfiguration, setRuntimeRiskConfiguration } from '../risk-config';
import type { PreauditProject } from '../types';

const generateText = vi.fn();
vi.mock('ai', () => ({ generateText }));
vi.mock('@/lib/llm', () => ({ getLLMProvider: () => () => 'test-model', getDefaultModel: () => 'test-model' }));

const now = '2026-08-19T00:00:00.000Z';
const project: PreauditProject = {
  id: 'qa-project', templateVersion: '2026-08', token: 'preaudit202608', salesName: '张三', status: 'pending_review',
  answers: {
    salesBg: { value: 'DIG', source: 'sales', updatedAt: now },
    contractName: { value: '智慧园区项目', source: 'sales', updatedAt: now },
    collectionCommitment: { value: '2027年3月完成全部回款', source: 'sales', updatedAt: now },
  },
  messages: [], risks: [], narratives: {}, createdAt: now, updatedAt: now,
};

describe('submitted project read-only QA', () => {
  afterEach(() => {
    generateText.mockReset();
    setRuntimeRiskConfiguration(defaultRiskConfiguration(now));
  });

  it('answers common project facts locally without mutating the project', async () => {
    generateText.mockResolvedValue({ text: '当前项目为智慧园区项目。' });
    const before = structuredClone(project);
    const { answerProjectQuestion } = await import('../project-qa');
    const answer = await answerProjectQuestion(project, '项目名称是什么？');

    expect(answer).toContain('智慧园区项目');
    expect(generateText).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });

  it('uses only company and selected BG rules for a model-backed summary question', async () => {
    generateText.mockResolvedValue({ text: '当前项目为智慧园区项目。' });
    const { answerProjectQuestion } = await import('../project-qa');
    await answerProjectQuestion(project, '请用一句话概括这个项目的审批情况。');
    const call = generateText.mock.calls[0][0] as { system: string; prompt: string };

    expect(call.system).toContain('只读问答助手');
    expect(call.prompt).toContain('COMPANY');
    expect(call.prompt).toContain('DIG');
    expect(call.prompt).not.toContain('TSG/');
    expect(call.prompt).not.toContain('SCG/');
  });

  it('uses a project-only fallback when the model is unavailable', async () => {
    generateText.mockRejectedValue(new Error('offline'));
    const { answerProjectQuestion } = await import('../project-qa');
    await expect(answerProjectQuestion(project, '回款承诺是什么？')).resolves.toContain('2027年3月完成全部回款');
  });
});
