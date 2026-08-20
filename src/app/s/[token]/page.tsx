'use client';

import { use, useEffect, useState } from 'react';
import CompletePage from '@/components/sales/CompletePage';
import CommitmentReviewCard from '@/components/sales/CommitmentReviewCard';
import FieldSummary from '@/components/sales/FieldSummary';
import RiskReviewCard from '@/components/sales/RiskReviewCard';
import VoiceChatPanel from '@/components/sales/VoiceChatPanel';
import WelcomePage from '@/components/sales/WelcomePage';
import type { PreauditProject } from '@/domain/preaudit/types';
import type { OrganizationNode } from '@/domain/preaudit/organization-config';

type Step = 'loading' | 'error' | 'welcome' | 'chat' | 'summary' | 'risk' | 'commitment' | 'complete';

interface TemplateInfo {
  id: string;
  version: string;
  name: string;
  fields: Array<{ key: string; label: string; required: boolean }>;
  organization: {
    bgs: OrganizationNode[];
    bus: OrganizationNode[];
    regions: OrganizationNode[];
  };
}

async function apiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { message?: string } };
    return typeof body.error === 'string' ? body.error : body.error?.message ?? '请求失败';
  } catch {
    return '请求失败';
  }
}

export default function SalesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [step, setStep] = useState<Step>('loading');
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [project, setProject] = useState<PreauditProject | null>(null);
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [chatNotice, setChatNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/s/${token}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response));
        return (await response.json()) as TemplateInfo;
      })
      .then((data) => { setTemplate(data); setStep('welcome'); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '链接加载失败'); setStep('error');
      });
    return () => controller.abort();
  }, [token]);

  async function start(identity: {
    salesName: string;
    salesBu: string;
    salesRegion: string;
    opportunitySerialNumber?: string;
    startMode: 'new' | 'resume';
  }) {
    setStarting(true); setError('');
    try {
      const response = await fetch(`/api/s/${token}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const data = (await response.json()) as { project: PreauditProject; resumed: boolean };
      setProject(data.project);
      setChatNotice(data.resumed ? '已恢复上次未完成的填写记录。' : '项目已创建，请先根据提纲完整介绍项目情况。');
      setStep('chat');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '启动失败，请重试'); setStep('error');
    } finally { setStarting(false); }
  }

  async function inspectCurrentStage() {
    if (!project || preparing) return;
    setPreparing(true); setChatNotice('');
    try {
      const response = await fetch(`/api/s/${token}/workflow?projectId=${encodeURIComponent(project.id)}`);
      if (!response.ok) throw new Error(await apiError(response));
      const data = (await response.json()) as { project: PreauditProject; flow: { stage: number; awaitingSummaryConfirmation?: boolean; awaitingRiskAcknowledgement?: boolean; readyForReview?: boolean; message?: string } };
      setProject(data.project);
      if (data.flow.awaitingSummaryConfirmation) setStep('summary');
      else if (data.flow.awaitingRiskAcknowledgement) setStep('risk');
      else if (data.flow.readyForReview) setStep('commitment');
      else { setStep('chat'); setChatNotice(data.flow.message ?? '当前阶段仍有信息需要补充，请继续回答 Agent 的问题。'); }
    } catch (reason) {
      setChatNotice(reason instanceof Error ? reason.message : '信息尚未完整，请继续补充');
    } finally { setPreparing(false); }
  }

  async function workflowAction(action: 'confirm_summary' | 'acknowledge_risks') {
    if (!project || preparing) return;
    setPreparing(true); setError('');
    try {
      const response = await fetch(`/api/s/${token}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, action }) });
      if (!response.ok) throw new Error(await apiError(response));
      const data = (await response.json()) as { project: PreauditProject };
      setProject(data.project);
      if (action === 'confirm_summary') setStep('risk');
      else { setChatNotice('风险已知悉。接下来请先说明真实可执行的应对措施，以及回款、利润、交付和新商机承诺。'); setStep('chat'); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '流程操作失败');
    } finally { setPreparing(false); }
  }

  async function submitReview() {
    if (!project || preparing) return;
    setPreparing(true); setError('');
    try {
      const response = await fetch(`/api/s/${token}/prepare-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) });
      if (!response.ok) throw new Error(await apiError(response));
      const data = (await response.json()) as { project: PreauditProject };
      setProject(data.project); setStep('complete');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '承诺尚未完整，请继续补充');
    } finally { setPreparing(false); }
  }

  if (step === 'loading') {
    return (
      <main className="safe-top flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand)] text-[var(--surface)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6m-3-3v6m7-9.5A2.5 2.5 0 0 0 16.5 3h-9A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--muted)]">正在核验审批链接…</p>
        </div>
      </main>
    );
  }

  if (step === 'error') {
    return (
      <main className="safe-top flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <section className="product-surface p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-500">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 9v4m0 3h.01M10.3 4.5 3.8 16a2 2 0 0 0 1.74 3h12.92a2 2 0 0 0 1.74-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
              </svg>
            </div>
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-red-700">无法继续</p>
            <h1 className="mt-2 text-xl font-bold">审批链接或服务异常</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{error}</p>
            <button type="button" onClick={() => window.location.reload()} className="primary-action mt-6 w-full px-4">
              重新加载
            </button>
            <p className="mt-4 text-xs text-[var(--muted)]">请核对链接，或联系内网系统管理员。</p>
          </section>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--muted)]">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--brand)] text-[10px] text-[var(--surface)]">AI</span>
            亚信科技
          </div>
        </div>
      </main>
    );
  }

  if (step === 'welcome' && template) {
    return (
      <WelcomePage
        templateName={template.name}
        templateVersion={template.version}
        organization={template.organization}
        onStart={start}
        isLoading={starting}
      />
    );
  }

  if (step === 'chat' && project && template) return (
    <main className="flex h-dvh flex-col bg-[var(--canvas)]">
      <header className="safe-top flex min-h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-[var(--surface)]">AI</div>
          <div className="min-w-0">
            <p className="text-sm font-bold">域外合同前置审批</p>
            <p className="truncate text-xs text-[var(--muted)]">{template.name} · {project.salesName}</p>
          </div>
        </div>
        <button type="button" onClick={() => void inspectCurrentStage()} disabled={preparing} className="primary-action shrink-0 px-4 text-sm">{preparing ? '检查中…' : project.conversationState?.phase === 'commitments' ? '核对承诺' : '生成汇报卡'}</button>
      </header>
      {chatNotice && <p role="status" className="border-b border-[var(--border)] bg-[var(--brand-soft)] px-4 py-2 text-sm text-[var(--brand-strong)]">{chatNotice}</p>}
      <div className="min-h-0 flex-1"><VoiceChatPanel token={token} project={project} onRequestReview={() => void inspectCurrentStage()} isPreparing={preparing} actionLabel={project.conversationState?.phase === 'commitments' ? '核对承诺完整度' : '查看并确认汇报卡'} /></div>
    </main>
  );

  if (step === 'summary' && project && template) return (
    <main className="safe-top min-h-screen p-4 pb-28 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] font-bold text-[var(--brand-strong)]">✓</div>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand-strong)]">阶段 2/5 · 信息确认</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">项目汇报卡</h1>
          </div>
        </div>
        <p className="mt-4 max-w-[70ch] text-sm leading-6 text-[var(--muted)]">请集中确认 Agent 从项目汇报中整理的信息。标记为“待系统/后台核验”的字段无需销售自行判断；发现事实不准确时返回对话补充或纠正。</p>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="product-surface mt-7 px-4 md:px-6"><FieldSummary project={project} /></div>
        <div className="product-surface sticky bottom-4 mt-6 flex flex-col-reverse gap-2 p-3 shadow-[0_12px_32px_oklch(0.32_0.04_255/0.10)] sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setStep('chat')} className="product-control px-5 text-sm">返回补充或修改</button>
          <button type="button" onClick={() => void workflowAction('confirm_summary')} disabled={preparing} className="primary-action px-5 text-sm">{preparing ? '确认中…' : '确认信息，进入风险核对'}</button>
        </div>
      </div>
    </main>
  );

  if (step === 'risk' && project) return (
    <main className="safe-top min-h-screen p-4 pb-28 md:p-8"><div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand-strong)]">阶段 3/5 · 风险核对</p><h1 className="mt-2 text-2xl font-bold">查看当前项目适用风险</h1>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <div className="mt-6"><RiskReviewCard project={project} /></div>
      <div className="product-surface sticky bottom-4 mt-6 flex flex-col-reverse gap-2 p-3 shadow-[0_12px_32px_oklch(0.32_0.04_255/0.10)] sm:flex-row sm:justify-end"><button type="button" onClick={() => setStep('summary')} className="product-control px-5 text-sm">返回汇报卡</button><button type="button" onClick={() => void workflowAction('acknowledge_risks')} disabled={preparing} className="primary-action px-5 text-sm">{preparing ? '处理中…' : '已知悉，进入应对与承诺'}</button></div>
    </div></main>
  );

  if (step === 'commitment' && project) return (
    <main className="safe-top min-h-screen p-4 pb-28 md:p-8"><div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand-strong)]">阶段 4/5 · 应对与承诺</p><h1 className="mt-2 text-2xl font-bold">最终承诺卡</h1>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <div className="mt-6"><CommitmentReviewCard project={project} /></div>
      <div className="product-surface sticky bottom-4 mt-6 flex flex-col-reverse gap-2 p-3 shadow-[0_12px_32px_oklch(0.32_0.04_255/0.10)] sm:flex-row sm:justify-end"><button type="button" onClick={() => setStep('chat')} className="product-control px-5 text-sm">返回补充承诺</button><button type="button" onClick={() => void submitReview()} disabled={preparing} className="primary-action px-5 text-sm">{preparing ? '送审中…' : '确认承诺并送后台复核'}</button></div>
    </div></main>
  );

  if (step === 'complete' && project && template) return <CompletePage templateName={template.name} salesName={project.salesName} token={token} projectId={project.id} />;
  return null;
}
