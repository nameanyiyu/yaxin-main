import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreauditProject } from '../types';

const now = '2026-08-19T00:00:00.000Z';
const project: PreauditProject = {
  id: 'project-1', templateVersion: '2026-08', token: 'preaudit202608', salesName: '张三', status: 'interviewing',
  answers: { salesBg: { value: 'DIG', source: 'sales', updatedAt: now } }, messages: [], risks: [], narratives: {}, createdAt: now, updatedAt: now,
};
const service = {
  getProject: vi.fn(),
  confirmReportSummary: vi.fn(),
  acknowledgeRisks: vi.fn(),
};

vi.mock('../bootstrap', () => ({
  getTemplateByToken: vi.fn(async () => ({ token: 'preaudit202608' })),
  getPreauditService: vi.fn(async () => service),
}));
vi.mock('../project-qa', () => ({ answerProjectQuestion: vi.fn(async () => '只读答案') }));

describe('sales workflow and QA routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getProject.mockResolvedValue(structuredClone(project));
    service.confirmReportSummary.mockResolvedValue({ ...structuredClone(project), conversationState: { phase: 'risk_review', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now } });
    service.acknowledgeRisks.mockResolvedValue({ ...structuredClone(project), conversationState: { phase: 'commitments', askedTopicIds: [], notifiedRiskIds: [], summaryConfirmedAt: now, risksAcknowledgedAt: now } });
  });

  it('returns the report card flow and advances only through explicit actions', async () => {
    const route = await import('@/app/api/s/[token]/workflow/route');
    const getResponse = await route.GET(new Request('http://localhost/api/s/preaudit202608/workflow?projectId=project-1'), { params: Promise.resolve({ token: 'preaudit202608' }) });
    const confirmResponse = await route.POST(new Request('http://localhost/api/s/preaudit202608/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'project-1', action: 'confirm_summary' }) }), { params: Promise.resolve({ token: 'preaudit202608' }) });
    const acknowledgeResponse = await route.POST(new Request('http://localhost/api/s/preaudit202608/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'project-1', action: 'acknowledge_risks' }) }), { params: Promise.resolve({ token: 'preaudit202608' }) });

    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).flow.stage).toBe(1);
    expect(confirmResponse.status).toBe(200);
    expect(acknowledgeResponse.status).toBe(200);
    expect(service.confirmReportSummary).toHaveBeenCalledWith('project-1');
    expect(service.acknowledgeRisks).toHaveBeenCalledWith('project-1');
  });

  it('allows QA only after the project has been submitted', async () => {
    const { POST } = await import('@/app/api/s/[token]/qa/route');
    const request = () => new Request('http://localhost/api/s/preaudit202608/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'project-1', question: '当前风险是什么？' }) });
    const blocked = await POST(request(), { params: Promise.resolve({ token: 'preaudit202608' }) });
    service.getProject.mockResolvedValue({ ...structuredClone(project), status: 'pending_review' });
    const allowed = await POST(request(), { params: Promise.resolve({ token: 'preaudit202608' }) });

    expect(blocked.status).toBeGreaterThanOrEqual(400);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ answer: '只读答案' });
  });
});
