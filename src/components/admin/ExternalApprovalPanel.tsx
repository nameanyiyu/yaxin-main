'use client';

import { useState } from 'react';
import type { ApprovalDecision, PreauditProject } from '@/domain/preaudit/types';

interface Props {
  project: PreauditProject;
  onProjectChange: (project: PreauditProject) => void;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { error?: { message?: string } }).error?.message ?? '操作失败';
  } catch {
    return '操作失败';
  }
}

export default function ExternalApprovalPanel({ project, onProjectChange }: Props) {
  const [decision, setDecision] = useState<ApprovalDecision>('approved');
  const [decisionDate, setDecisionDate] = useState(new Date().toISOString().slice(0, 10));
  const [externalReference, setExternalReference] = useState(project.externalSubmission?.externalReference ?? '');
  const [comments, setComments] = useState('');
  const [specialApprovalItems, setSpecialApprovalItems] = useState('');
  const [conditionalReason, setConditionalReason] = useState('');
  const [conditions, setConditions] = useState('');
  const [operator, setOperator] = useState('');
  const [verificationComments, setVerificationComments] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function submitDecision() {
    setBusy('decision'); setError('');
    try {
      const response = await fetch(`/api/admin/projects/${project.id}/external-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          decisionDate,
          externalReference,
          comments,
          specialApprovalItems,
          conditionalReason,
          conditions,
          recordedBy: operator,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      onProjectChange(((await response.json()) as { project: PreauditProject }).project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审批结果保存失败');
    } finally {
      setBusy('');
    }
  }

  async function verifyCondition(result: 'fulfilled' | 'failed') {
    setBusy(result); setError('');
    try {
      const response = await fetch(`/api/admin/projects/${project.id}/external-approval/verify-condition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, comments: verificationComments, verifiedBy: operator }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      onProjectChange(((await response.json()) as { project: PreauditProject }).project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '条件核验失败');
    } finally {
      setBusy('');
    }
  }

  const approval = project.externalApproval;
  return (
    <section className="product-surface mt-4 scroll-mt-16 p-5 xl:p-6" aria-labelledby="external-approval-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="external-approval-heading" className="font-bold">外部审批结果</h4>
          <p className="mt-1 text-xs text-[var(--muted)]">记录真实外部结果；当前未接入 OA，不会自动伪造审批状态。</p>
        </div>
        {approval && (
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold">
            {approval.decision === 'approved' ? '已完成审批' : approval.decision === 'rejected' ? '被驳回' : '有条件准入'}
          </span>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {project.status === 'pending_external_decision' && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-bold text-[var(--muted)]">审批结论</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['approved', '已完成审批'],
                ['rejected', '被驳回'],
                ['conditional', '有条件准入'],
              ] as Array<[ApprovalDecision, string]>).map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${decision === value ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-[var(--border)]'}`}>
                  <input className="sr-only" type="radio" name="approval-decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium">审批日期<input type="date" value={decisionDate} onChange={(event) => setDecisionDate(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
          <label className="text-sm font-medium">外部审批单号（选填）<input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
          {decision === 'conditional' && (
            <>
              <label className="text-sm font-medium md:col-span-2">条件准入原因<textarea rows={2} value={conditionalReason} onChange={(event) => setConditionalReason(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label>
              <label className="text-sm font-medium md:col-span-2">准入条件<textarea rows={3} value={conditions} onChange={(event) => setConditions(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label>
            </>
          )}
          {decision !== 'rejected' && (
            <label className="text-sm font-medium md:col-span-2">
              特批事项
              <span className="ml-1 text-red-700">*</span>
              <textarea
                rows={3}
                value={specialApprovalItems}
                onChange={(event) => setSpecialApprovalItems(event.target.value)}
                placeholder="填写项目获批后需要持续核查或跟踪的特批要求"
                className="product-control mt-1 w-full px-3 py-2"
              />
            </label>
          )}
          <label className="text-sm font-medium md:col-span-2">{decision === 'rejected' ? '驳回原因' : '审批说明（选填）'}<textarea rows={2} value={comments} onChange={(event) => setComments(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label>
          <label className="text-sm font-medium">记录人<input value={operator} onChange={(event) => setOperator(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
          <div className="flex items-end"><button type="button" onClick={() => void submitDecision()} disabled={Boolean(busy) || !operator.trim() || decision !== 'rejected' && !specialApprovalItems.trim()} className="primary-action px-5 text-sm">{busy === 'decision' ? '保存中…' : '确认审批结果'}</button></div>
        </div>
      )}

      {project.status === 'conditional_admission' && approval && (
        <div className="mt-5">
          <dl className="grid gap-3 rounded-xl bg-amber-50 p-4 text-sm md:grid-cols-2">
            <div><dt className="text-xs font-bold text-amber-800">准入原因</dt><dd className="mt-1">{approval.conditionalReason}</dd></div>
            <div><dt className="text-xs font-bold text-amber-800">待满足条件</dt><dd className="mt-1">{approval.conditions}</dd></div>
          </dl>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="text-sm font-medium">核验说明<textarea rows={2} value={verificationComments} onChange={(event) => setVerificationComments(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label>
            <label className="text-sm font-medium">核验人<input value={operator} onChange={(event) => setOperator(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void verifyCondition('fulfilled')} disabled={Boolean(busy) || !operator.trim() || !verificationComments.trim()} className="primary-action px-4 text-sm">{busy === 'fulfilled' ? '确认中…' : '条件已满足，进入跟踪'}</button>
            <button type="button" onClick={() => void verifyCondition('failed')} disabled={Boolean(busy) || !operator.trim() || !verificationComments.trim()} className="rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{busy === 'failed' ? '确认中…' : '条件未满足，驳回项目'}</button>
          </div>
        </div>
      )}

      {approval?.history.length ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="text-xs font-bold text-[var(--muted)]">审批事件</p>
          <ol className="mt-3 space-y-2">
            {approval.history.toReversed().map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span>{event.action === 'recorded' ? '登记审批结果' : event.action === 'condition_fulfilled' ? '条件核验通过' : event.action === 'condition_failed' ? '条件核验失败' : '审批结果更正'} · {event.operator}</span>
                <time className="text-xs text-[var(--muted)]">{new Date(event.at).toLocaleString('zh-CN')}</time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
