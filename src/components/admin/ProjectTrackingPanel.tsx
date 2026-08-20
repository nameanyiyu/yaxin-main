'use client';

import { useMemo, useState } from 'react';
import {
  isSupplierTrackingApplicable,
  TRACKING_FIELDS,
  trackingDerivedValues,
  trackingFieldOwnership,
  type TrackingFieldDefinition,
} from '@/domain/preaudit/tracking-fields';
import type {
  CompletionOutcome,
  ExecutionHealth,
  PreauditProject,
  TrackingFieldValue,
} from '@/domain/preaudit/types';

interface Props {
  project: PreauditProject;
  onProjectChange: (project: PreauditProject) => void;
}

const SECTION_LABELS: Record<TrackingFieldDefinition['section'], string> = {
  basic: '基本信息',
  overview: '项目整体情况',
  signing: '签约跟踪',
  collection: '回款执行跟踪',
  delivery: '交付执行跟踪',
  procurement: '供应商交付执行跟踪',
  feedback: '事业部跟踪反馈',
};

const DERIVED_SECTION_LABELS: Partial<Record<TrackingFieldDefinition['section'], string>> = {
  basic: '基本信息',
  overview: '审批与项目情况',
  signing: '签约审批数据',
  feedback: '事业部承诺',
};

function snapshotDraft(values: Record<string, TrackingFieldValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values ?? {}).filter(([key]) => {
      const field = TRACKING_FIELDS.find((candidate) => candidate.key === key);
      return field && trackingFieldOwnership(field) === 'snapshot';
    }),
  );
}

function displayValue(field: TrackingFieldDefinition, value: TrackingFieldValue | undefined): string {
  if (value === undefined || value === '') {
    return field.key === 'specialApprovalItems' ? '历史项目未登记特批事项' : '审批资料未填写';
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (field.type === 'amount' && typeof value === 'number') {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
  }
  if (field.type === 'percentage' && typeof value === 'number') return `${value}%`;
  return String(value);
}

async function apiError(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { error?: { message?: string } }).error?.message ?? '操作失败';
  } catch {
    return '操作失败';
  }
}

function TrackingInput({ field, value, onChange }: { field: TrackingFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const className = 'product-control mt-1 w-full px-3 text-sm';
  if (field.options) {
    return <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} className={className}><option value="">请选择</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  }
  if (field.type === 'textarea') {
    return <textarea rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} className={`${className} py-2`} />;
  }
  if (field.type === 'amount' || field.type === 'percentage' || field.type === 'number') {
    return <input type="number" min="0" max={field.type === 'percentage' ? 100 : undefined} value={typeof value === 'number' ? value : String(value ?? '')} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} className={className} />;
  }
  return <input type={field.type === 'date' ? 'date' : 'text'} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} className={className} />;
}

export default function ProjectTrackingPanel({ project, onProjectChange }: Props) {
  const current = useMemo(() => project.tracking?.snapshots.find((snapshot) => snapshot.id === project.tracking?.currentSnapshotId), [project]);
  const derivedValues = useMemo(() => trackingDerivedValues(project), [project]);
  const supplierApplicable = useMemo(() => isSupplierTrackingApplicable(project), [project]);
  const [editing, setEditing] = useState(project.tracking?.status === 'not_started');
  const [draft, setDraft] = useState<Record<string, unknown>>(() => snapshotDraft(current?.values));
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');
  const [executionHealth, setExecutionHealth] = useState<ExecutionHealth | ''>(current?.executionHealth ?? '');
  const [executionHealthReason, setExecutionHealthReason] = useState(current?.executionHealthReason ?? '');
  const [completionOutcome, setCompletionOutcome] = useState<CompletionOutcome | ''>('');
  const [completionOutcomeReason, setCompletionOutcomeReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (!project.tracking || !['tracking', 'tracking_completed'].includes(project.status)) return null;

  async function saveSnapshot() {
    setBusy('save'); setError('');
    try {
      const response = await fetch(`/api/admin/projects/${project.id}/tracking/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveDate,
          baseSnapshotId: current?.id,
          values: draft,
          executionHealth,
          executionHealthReason,
          source: 'manual',
          note,
          createdBy: operator,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      onProjectChange(((await response.json()) as { project: PreauditProject }).project);
      setEditing(false); setNote('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '跟踪记录保存失败');
    } finally {
      setBusy('');
    }
  }

  async function complete() {
    setBusy('complete'); setError('');
    try {
      const response = await fetch(`/api/admin/projects/${project.id}/tracking/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedBy: operator,
          note,
          completionOutcome,
          completionOutcomeReason,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      onProjectChange(((await response.json()) as { project: PreauditProject }).project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '结束跟踪失败');
    } finally {
      setBusy('');
    }
  }

  const derivedFields = TRACKING_FIELDS.filter(
    (field) => trackingFieldOwnership(field) === 'derived',
  );
  const editableFields = TRACKING_FIELDS.filter(
    (field) => trackingFieldOwnership(field) === 'snapshot'
      && (field.section !== 'procurement' || supplierApplicable),
  );
  return (
    <section className="product-surface mt-4 scroll-mt-16 p-5 xl:p-6" aria-labelledby="tracking-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="tracking-heading" className="font-bold">合同项目跟踪</h4>
          <p className="mt-1 text-xs text-[var(--muted)]">确认后形成只读历史快照；下一期会继承本期内容。</p>
        </div>
        {project.status === 'tracking' && !editing && <button type="button" onClick={() => { setDraft(snapshotDraft(current?.values)); setExecutionHealth(current?.executionHealth ?? ''); setExecutionHealthReason(current?.executionHealthReason ?? ''); setEditing(true); }} className="primary-action px-4 text-sm">新增本期跟踪</button>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="mt-5 border-y border-[var(--border)] bg-[var(--surface-muted)]/45 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div>
            <h5 className="text-sm font-bold">审批资料同步</h5>
            <p className="mt-1 text-xs text-[var(--muted)]">基本情况、特批事项及审批结果自动带入，无需重复维护。</p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">来自审批资料 · 只读</span>
        </div>
        {(Object.keys(DERIVED_SECTION_LABELS) as TrackingFieldDefinition['section'][]).map((section) => {
          const fields = derivedFields.filter((field) => field.section === section);
          if (!fields.length) return null;
          return (
            <div key={section} className="border-t border-[var(--border)] py-4">
              <h6 className="text-xs font-bold text-[var(--muted)]">{DERIVED_SECTION_LABELS[section]}</h6>
              <dl className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                {fields.map((field) => {
                  const value = derivedValues[field.key];
                  const wide = field.type === 'textarea';
                  return (
                    <div key={field.key} className={wide ? 'md:col-span-2 xl:col-span-3' : ''}>
                      <dt className="text-xs text-[var(--muted)]">{field.label}</dt>
                      <dd className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${value === undefined || value === '' ? 'text-slate-400' : 'font-medium text-[var(--ink)]'}`}>
                        {displayValue(field, value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>

      {editing && project.status === 'tracking' && (
        <div className="mt-5">
          <div className="grid gap-3 border-b border-[var(--border)] pb-5 md:grid-cols-3">
            <label className="text-sm font-medium">本期日期<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
            <label className="text-sm font-medium">记录人<input value={operator} onChange={(event) => setOperator(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
            <label className="text-sm font-medium">更正或补充说明（选填）<input value={note} onChange={(event) => setNote(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
          </div>
          <div className="border-b border-[var(--border)] py-5">
            <h5 className="text-sm font-bold">本期执行结论 <span className="text-red-600">*</span></h5>
            <p className="mt-1 text-xs text-[var(--muted)]">由跟踪人员结合本期回款、利润、交付和承诺情况判断；系统预警不会替代该结论。</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([
                ['normal', '正常执行'],
                ['at_risk', '高风险预警'],
                ['breached', '明确承诺未达成'],
              ] as const).map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-xl border px-4 py-3 text-sm font-semibold ${executionHealth === value ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-[var(--border)]'}`}>
                  <input type="radio" name="execution-health" value={value} checked={executionHealth === value} onChange={() => setExecutionHealth(value)} className="mr-2" />
                  {label}
                </label>
              ))}
            </div>
            <label className="mt-3 block text-xs font-semibold text-[var(--muted)]">
              状态说明{executionHealth === 'at_risk' || executionHealth === 'breached' ? '（必填）' : '（选填）'}
              <textarea rows={2} value={executionHealthReason} onChange={(event) => setExecutionHealthReason(event.target.value)} className="product-control mt-1 w-full px-3 py-2" placeholder="说明判断依据、影响和下一步措施" />
            </label>
          </div>
          {(Object.keys(SECTION_LABELS) as TrackingFieldDefinition['section'][]).map((section) => {
            const fields = editableFields.filter((field) => field.section === section);
            if (!fields.length) return null;
            return <div key={section} className="border-b border-[var(--border)] py-5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-bold">{SECTION_LABELS[section]}</h5>{section === 'procurement' && <span className="text-xs text-[var(--muted)]">因项目涉及采购或命中采购风险而显示</span>}</div><div className="mt-3 grid gap-x-5 gap-y-4 md:grid-cols-2">{fields.map((field) => <label key={field.key} className={`text-xs font-semibold text-[var(--muted)] ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>{field.label}<TrackingInput field={field} value={draft[field.key]} onChange={(value) => setDraft((state) => ({ ...state, [field.key]: value }))} /></label>)}</div></div>;
          })}
          <div className="sticky bottom-3 flex flex-wrap justify-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
            {current && <button type="button" onClick={() => setEditing(false)} className="product-control px-4 text-sm font-semibold">取消</button>}
            <button type="button" onClick={() => void saveSnapshot()} disabled={Boolean(busy) || !operator.trim() || !effectiveDate || !executionHealth || (['at_risk', 'breached'].includes(executionHealth) && !executionHealthReason.trim())} className="primary-action px-5 text-sm">{busy === 'save' ? '确认中…' : '确认本期记录'}</button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-[var(--border)] pt-5">
        <h5 className="text-sm font-bold">历史跟踪记录</h5>
        {project.tracking.snapshots.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">尚未提交跟踪记录。</p> : (
          <ol className="mt-3 space-y-2">
            {project.tracking.snapshots.toReversed().map((snapshot) => (
              <li key={snapshot.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[var(--ink)]">{snapshot.effectiveDate}</strong><span>{snapshot.source === 'excel_import' ? 'Excel 导入' : '人工维护'} · {snapshot.createdBy}</span></div>
                <p className="mt-2">
                  执行结论：{snapshot.executionHealth === 'normal' ? '正常执行' : snapshot.executionHealth === 'at_risk' ? '高风险预警' : snapshot.executionHealth === 'breached' ? '明确承诺未达成' : '历史记录未维护'}
                  {snapshot.executionHealthReason ? `（${snapshot.executionHealthReason}）` : ''}
                </p>
                <p className="mt-1">本期锁定 {Object.values(snapshot.values).filter((value): value is TrackingFieldValue => value !== undefined).length} 项字段{snapshot.note ? `，说明：${snapshot.note}` : ''}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {project.status === 'tracking' && current && !editing && (
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <h5 className="text-sm font-bold">确认结束跟踪</h5>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {([
              ['achieved', '承诺按期达成'],
              ['not_achieved', '承诺未达成'],
            ] as const).map(([value, label]) => (
              <label key={value} className={`cursor-pointer rounded-xl border px-4 py-3 text-sm font-semibold ${completionOutcome === value ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-[var(--border)]'}`}>
                <input type="radio" name="completion-outcome" value={value} checked={completionOutcome === value} onChange={() => setCompletionOutcome(value)} className="mr-2" />
                {label}
              </label>
            ))}
          </div>
          {completionOutcome === 'not_achieved' && (
            <label className="mt-3 block text-sm font-medium">未达成原因 <span className="text-red-600">*</span><textarea rows={2} value={completionOutcomeReason} onChange={(event) => setCompletionOutcomeReason(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <label className="text-sm font-medium">结束说明<input value={note} onChange={(event) => setNote(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
            <label className="text-sm font-medium">确认人<input value={operator} onChange={(event) => setOperator(event.target.value)} className="product-control mt-1 w-full px-3" /></label>
            <div className="flex items-end"><button type="button" onClick={() => void complete()} disabled={Boolean(busy) || !operator.trim() || !note.trim() || !completionOutcome || (completionOutcome === 'not_achieved' && !completionOutcomeReason.trim())} className="product-control px-4 text-sm font-semibold">{busy === 'complete' ? '确认中…' : '确认跟踪结束'}</button></div>
          </div>
        </div>
      )}

      {project.status === 'tracking_completed' && project.tracking.completionOutcome && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
          <strong>{project.tracking.completionOutcome === 'achieved' ? '承诺按期达成' : '承诺未达成'}</strong>
          {project.tracking.completionOutcomeReason && <p className="mt-1 text-[var(--muted)]">{project.tracking.completionOutcomeReason}</p>}
        </div>
      )}
    </section>
  );
}
