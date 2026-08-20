'use client';

import { useMemo, useState } from 'react';
import { presentProject, type PresentedField } from '@/domain/preaudit/presentation';
import { riskControlLevelLabel } from '@/domain/preaudit/risk-level';
import type { FieldValue, PreauditProject } from '@/domain/preaudit/types';
import { projectAction, projectRiskEvidence } from '@/lib/admin-workbench';
import ProjectHistoryPanel from './ProjectHistoryPanel';
import ExternalApprovalPanel from './ExternalApprovalPanel';
import ProjectTrackingPanel from './ProjectTrackingPanel';

interface Props {
  project: PreauditProject;
  onProjectChange: (project: PreauditProject) => void;
}

type DraftValues = Record<string, FieldValue>;
type FeishuStatus = 'idle' | 'generating' | 'created' | 'existing' | 'failed';

function initialDraft(project: PreauditProject): DraftValues {
  return Object.fromEntries(Object.entries(project.answers).map(([key, answer]) => [key, answer.value]));
}

function contractName(project: PreauditProject): string {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : '未填写合同名称';
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { message?: string } };
    if (typeof body.error === 'string') return body.error;
    return body.error?.message ?? '操作失败';
  } catch {
    return '操作失败';
  }
}

function FieldEditor({ field, value, onChange }: { field: PresentedField; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const baseClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';
  if (field.type === 'boolean') {
    return (
      <select value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(event) => onChange(event.target.value === 'true')} className={baseClass}>
        <option value="" disabled>请选择</option><option value="true">是</option><option value="false">否</option>
      </select>
    );
  }
  if (['number', 'amount', 'percentage'].includes(field.type)) {
    return <input type="number" min="0" max={field.type === 'percentage' ? 100 : undefined} value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(Number(event.target.value))} className={baseClass} />;
  }
  const textValue = typeof value === 'string' ? value : '';
  if (field.guidance || field.type === 'text' && textValue.length > 60) {
    return <textarea rows={3} value={textValue} onChange={(event) => onChange(event.target.value)} className={baseClass} />;
  }
  return <input type={field.type === 'date' ? 'date' : 'text'} value={textValue} onChange={(event) => onChange(event.target.value)} className={baseClass} />;
}

export default function ProjectReviewPanel({ project, onProjectChange }: Props) {
  const [draft, setDraft] = useState<DraftValues>(() => initialDraft(project));
  const [editing, setEditing] = useState(false);
  const [reviewerName, setReviewerName] = useState(project.review?.reviewerName ?? '');
  const [comments, setComments] = useState(project.review?.comments ?? '');
  const [externalReference, setExternalReference] = useState(project.externalSubmission?.externalReference ?? '');
  const [archiveNote, setArchiveNote] = useState(project.externalSubmission?.note ?? '');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [feishuDocumentUrl, setFeishuDocumentUrl] = useState(project.feishuDocument?.url ?? '');
  const [feishuDocumentProjectId, setFeishuDocumentProjectId] = useState(project.id);
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus>(project.feishuDocument ? 'existing' : 'idle');
  const displayedFeishuDocumentUrl = project.feishuDocument?.url
    ?? (feishuDocumentProjectId === project.id ? feishuDocumentUrl : '');

  const view = useMemo(() => presentProject(project), [project]);
  const triggeredRisks = project.risks.filter((risk) => risk.triggered);
  const nextAction = projectAction(project);
  const trackingVisible = ['tracking', 'tracking_completed'].includes(project.status);

  async function updateProject(path: string, method: 'PATCH' | 'POST', body?: object): Promise<PreauditProject> {
    const response = await fetch(`/api/admin/projects/${project.id}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(await responseError(response));
    return ((await response.json()) as { project: PreauditProject }).project;
  }

  async function saveFields() {
    setBusy('save'); setError(''); setNotice('');
    try {
      const updated = await updateProject('', 'PATCH', { values: draft });
      onProjectChange(updated); setEditing(false); setNotice('字段已保存，风险结果已重新计算。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setBusy(''); }
  }

  async function reviewProject() {
    setBusy('review'); setError(''); setNotice('');
    try {
      const answerUpdates = Object.fromEntries(Object.entries(draft).filter(
        ([key, value]) => project.answers[key]?.value !== value,
      ));
      const updated = await updateProject('/review', 'POST', { reviewerName, comments, answerUpdates });
      onProjectChange(updated); setEditing(false); setNotice('后台复核已确认，现在可以导出原表。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '复核失败'); }
    finally { setBusy(''); }
  }

  async function exportDocument() {
    setBusy('export'); setError(''); setNotice(project.templateVersion === '2026-08' ? '正在下载 Markdown，并生成飞书文档，请稍候…' : '正在生成导出文件，请稍候…');
    if (project.templateVersion === '2026-08') setFeishuStatus('generating');
    try {
      const isMarkdown = project.templateVersion === '2026-08';
      const response = await fetch(`/api/admin/projects/${project.id}/export${isMarkdown ? '?format=md' : ''}`, { method: 'POST' });
      if (!response.ok) throw new Error(await responseError(response));
      const remoteFeishuStatus = response.headers.get('X-Feishu-Doc-Status') as FeishuStatus | null;
      const encodedFeishuMessage = response.headers.get('X-Feishu-Doc-Message') ?? '';
      const feishuMessage = encodedFeishuMessage ? decodeURIComponent(encodedFeishuMessage) : '';
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const fileName = encodedName ? decodeURIComponent(encodedName) : `${contractName(project)}-前置审批表.${isMarkdown ? 'md' : 'xlsx'}`;
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
      const generatedFeishuUrl = response.headers.get('X-Feishu-Doc-URL') ?? '';
      if (generatedFeishuUrl) {
        setFeishuDocumentUrl(generatedFeishuUrl);
        setFeishuDocumentProjectId(project.id);
      }
      if (isMarkdown && remoteFeishuStatus) setFeishuStatus(remoteFeishuStatus);
      const refreshed = await fetch(`/api/admin/projects/${project.id}`);
      if (refreshed.ok) {
        const refreshedProject = ((await refreshed.json()) as { project: PreauditProject }).project;
        onProjectChange(refreshedProject);
        if (refreshedProject.feishuDocument?.url) {
          setFeishuDocumentUrl(refreshedProject.feishuDocument.url);
          setFeishuDocumentProjectId(refreshedProject.id);
        }
      }
      if (isMarkdown && remoteFeishuStatus === 'failed') {
        setNotice(`Markdown 填报文件已下载，但飞书文档生成失败：${feishuMessage || '未返回具体原因'}。请稍后再次点击导出重试。`);
      } else {
        setNotice(isMarkdown
          ? 'Markdown 填报文件已下载，飞书文档已生成。请打开链接核对后，再按实际流程提交外部审批并在此归档。'
          : '原表已导出。请在外部审批系统人工提交，提交后在此归档。');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导出失败'); }
    finally { setBusy(''); }
  }

  async function archiveProject() {
    setBusy('archive'); setError(''); setNotice('');
    try {
      const updated = await updateProject('/archive', 'POST', { externalReference, note: archiveNote });
      onProjectChange(updated); setNotice('人工提交已登记，等待外部审批结果。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '归档失败'); }
    finally { setBusy(''); }
  }

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-5 xl:p-6">
      <header className="product-surface overflow-hidden">
        <div className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-start xl:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-bold text-[var(--brand-strong)]">{view.statusLabel}</span>
              <span className="text-xs text-[var(--muted)]">模板 {project.templateVersion}</span>
            </div>
            <h3 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{contractName(project)}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">销售：{project.salesName} · 项目编号 {project.id.slice(0, 8)}</p>
          </div>
          <button type="button" onClick={() => setEditing((current) => !current)} disabled={!['interviewing', 'preaudit_needs_input', 'pending_review'].includes(project.status)} className="product-control shrink-0 px-4 text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50">{editing ? '取消编辑' : '编辑审批字段'}</button>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="border-b border-[var(--border)] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[var(--muted)]">必填完成度</p>
            <div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl">{view.progress.percent}%</strong><span className="text-xs text-[var(--muted)]">{view.progress.completed}/{view.progress.total} 项</span></div>
          </div>
          <div className="border-b border-[var(--border)] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[var(--muted)]">已触发风险</p>
            <div className="mt-1 flex items-baseline gap-2"><strong className={view.triggeredRiskCount ? 'text-2xl text-red-700' : 'text-2xl'}>{view.triggeredRiskCount}</strong><span className="text-xs text-[var(--muted)]">项规则命中</span></div>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-[var(--muted)]">下一步</p>
            <p className="mt-1 text-sm font-bold text-[var(--brand-strong)]">{nextAction.label}</p>
            <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{nextAction.description}</p>
          </div>
        </div>
      </header>

      {notice && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      <nav aria-label="项目详情分区" className="sticky top-16 z-10 -mx-1 mt-4 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-1 shadow-sm backdrop-blur lg:top-0">
        {[
          ['risk-heading', '风险结论'],
          ...(trackingVisible ? [['tracking-heading', '项目跟踪']] : []),
          ['fields-heading', '审批字段'],
          ['conversation', '访谈记录'],
          ['workflow', '流程记录'],
          ['action-heading', '流程处理'],
          ['external-approval-heading', '外部审批'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]">
            {label}
          </a>
        ))}
      </nav>

      <section className="product-surface mt-4 scroll-mt-16 p-5 xl:p-6" aria-labelledby="risk-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h4 id="risk-heading" className="font-bold">风险结论</h4><p className="mt-1 text-xs text-[var(--muted)]">确定性规则与 AI 语义识别合并展示；AI 结果需要专员复核。</p></div>
          <span className="text-xs font-semibold text-[var(--muted)]">{triggeredRisks.length} 项已触发</span>
        </div>
        {triggeredRisks.length === 0 ? <p className="mt-5 rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">当前未触发风险规则；仍需人工核验事实与证明材料。</p> : (
          <div className="mt-5 grid items-start gap-3 xl:grid-cols-2">
            {triggeredRisks.map((risk) => {
              const evidence = projectRiskEvidence(project, risk);
              const tone = risk.severity === 'blocking'
                ? 'border-red-200 bg-red-50/55'
                : risk.severity === 'high'
                  ? 'border-orange-200 bg-orange-50/45'
                  : 'border-amber-200 bg-amber-50/40';
              return (
                <article key={risk.ruleId} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><h5 className="font-bold">{risk.title}</h5>{risk.source === 'ai' && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">AI识别 · 待人工复核{risk.confidence !== undefined ? ` · ${Math.round(risk.confidence * 100)}%` : ''}</span>}</div>
                    <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-red-700">{riskControlLevelLabel(risk)}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6">{risk.reason}</p>
                  {risk.controlRequirement && <p className="mt-2 text-xs font-semibold leading-5 text-[var(--brand-strong)]">管控要求：{risk.controlRequirement}</p>}
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{risk.impact}</p>
                  {(evidence.rows.length > 0 || evidence.followUpQuestions.length > 0) && (
                    <details className="mt-4 rounded-xl border border-black/5 bg-white/70">
                      <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-bold text-[var(--brand-strong)]">
                        查看证据与核验项
                        {evidence.rows.length > 0 && <span className="ml-1 font-normal text-[var(--muted)]">（{evidence.rows.length} 项）</span>}
                      </summary>
                      <div className="border-t border-black/5 p-3">
                        {evidence.rows.length > 0 && (
                          <dl className="grid gap-2 sm:grid-cols-2">
                            {evidence.rows.map((row) => (
                              <div key={row.key} className={`rounded-lg border p-2.5 ${row.missing ? 'border-amber-300 bg-amber-50' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                                <dt className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]"><span>{row.label}</span>{row.missing && <span className="font-bold text-amber-800">缺失</span>}</dt>
                                <dd className="mt-1 text-sm font-bold">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {evidence.followUpQuestions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5">{evidence.followUpQuestions.map((question) => <li key={question}>{question}</li>)}</ul>}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ProjectTrackingPanel project={project} onProjectChange={onProjectChange} />

      <section className="product-surface mt-4 scroll-mt-16 p-5 xl:p-6" aria-labelledby="fields-heading">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h4 id="fields-heading" className="font-bold">审批字段</h4><p className="mt-1 text-xs text-[var(--muted)]">后台修订会记录字段来源并重新计算风险。</p></div>{editing && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">编辑模式</span>}</div>
        <div className="mt-2 divide-y divide-[var(--border)]">
          {view.sections.map((section) => (
            <div key={section.key} className="py-5"><h5 className="text-sm font-bold">{section.label}</h5><div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
              {section.fields.map((field) => <div key={field.key} className={field.guidance ? 'md:col-span-2' : ''}><label className="text-xs font-semibold text-[var(--muted)]">{field.label}{field.required && <span className="ml-1 text-red-700">*</span>}</label>{editing ? <FieldEditor field={field} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} /> : <p className={`mt-1 min-h-6 whitespace-pre-wrap text-sm font-medium leading-6 ${field.answered ? 'text-[var(--ink)]' : 'text-slate-400'}`}>{field.answered ? field.value === true ? '是' : field.value === false ? '否' : String(field.value) : '未填写'}</p>}{field.guidance && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">填写要求：{field.guidance}</p>}</div>)}
            </div></div>
          ))}
        </div>
        {editing && <div className="sticky bottom-3 flex justify-end rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur"><button type="button" onClick={() => void saveFields()} disabled={Boolean(busy)} className="primary-action px-4 text-sm">{busy === 'save' ? '保存中…' : '保存字段并重算风险'}</button></div>}
      </section>

      {Object.values(project.narratives).some(Boolean) && <section className="product-surface mt-4 p-5 xl:p-6" aria-labelledby="narratives-heading"><h4 id="narratives-heading" className="font-bold">项目说明汇总</h4><dl className="mt-4 grid gap-4 md:grid-cols-2">{project.narratives.projectOverview && <div className="rounded-xl bg-[var(--surface-muted)] p-4"><dt className="text-xs font-bold text-[var(--muted)]">项目概况</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{project.narratives.projectOverview}</dd></div>}{project.narratives.significance && <div className="rounded-xl bg-[var(--surface-muted)] p-4"><dt className="text-xs font-bold text-[var(--muted)]">项目意义</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{project.narratives.significance}</dd></div>}{project.narratives.controls && <div className="rounded-xl bg-[var(--surface-muted)] p-4"><dt className="text-xs font-bold text-[var(--muted)]">管控措施</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{project.narratives.controls}</dd></div>}{project.narratives.commitments && <div className="rounded-xl bg-[var(--surface-muted)] p-4"><dt className="text-xs font-bold text-[var(--muted)]">项目承诺</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{project.narratives.commitments}</dd></div>}</dl></section>}

      <section className="product-surface mt-4 p-5 xl:p-6">
        <ProjectHistoryPanel project={project} />
      </section>

      <section className="product-surface mt-4 scroll-mt-16 p-5 xl:p-6" aria-labelledby="action-heading">
        <div><h4 id="action-heading" className="font-bold">流程处理</h4><p className="mt-1 text-xs text-[var(--muted)]">{nextAction.description}</p></div>
        {project.status === 'pending_review' && <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">复核人<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} className="product-control mt-1 w-full px-3" /></label><label className="text-sm font-medium sm:col-span-2">复核意见<textarea rows={3} value={comments} onChange={(event) => setComments(event.target.value)} className="product-control mt-1 w-full px-3 py-2" /></label><div className="sm:col-span-2"><button type="button" onClick={() => void reviewProject()} disabled={Boolean(busy) || !reviewerName.trim() || !comments.trim()} className="primary-action px-5 text-sm">{busy === 'review' ? '确认中…' : '确认后台复核'}</button></div></div>}
        {['reviewed', 'pending_manual_submission'].includes(project.status) && <div className="mt-5"><button type="button" onClick={() => void exportDocument()} disabled={Boolean(busy)} className="primary-action px-5 text-sm">{busy === 'export' ? project.templateVersion === '2026-08' ? '正在下载并生成飞书文档…' : '正在生成…' : project.templateVersion === '2026-08' ? project.status === 'reviewed' ? '下载 Markdown 并生成飞书文档' : '重新下载 Markdown' : project.status === 'reviewed' ? '导出原表并转待人工提交' : '重新导出原表'}</button>{project.templateVersion === '2026-08' && displayedFeishuDocumentUrl && <a href={displayedFeishuDocumentUrl} target="_blank" rel="noreferrer" className="ml-3 inline-flex text-sm font-semibold text-[var(--brand-strong)] underline underline-offset-4">打开飞书审批文档</a>}{project.templateVersion === '2026-08' && feishuStatus === 'failed' && <p className="mt-3 text-sm font-semibold text-red-700">飞书文档生成失败，Markdown 已保留下载；可再次点击按钮重试。</p>}{project.templateVersion === '2026-08' && feishuStatus === 'generating' && <p className="mt-3 text-sm text-blue-700">飞书文档生成中，请保持当前页面，完成后会显示生成结果。</p>}</div>}
        {project.status === 'pending_manual_submission' && <div className="mt-5 grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2"><p className="text-sm leading-6 text-amber-950 sm:col-span-2">系统已生成飞书文档，但外部审批仍需按实际流程人工提交。提交后登记外部单号，项目随后进入“等待外部审批结果”。</p><label className="text-sm font-medium">外部审批单号（可选）<input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} className="product-control mt-1 w-full px-3" /></label><label className="text-sm font-medium">备注（可选）<input value={archiveNote} onChange={(event) => setArchiveNote(event.target.value)} className="product-control mt-1 w-full px-3" /></label><div className="sm:col-span-2"><button type="button" onClick={() => void archiveProject()} disabled={Boolean(busy)} className="product-control px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100">{busy === 'archive' ? '登记中…' : '确认已人工提交'}</button></div></div>}
        {project.status === 'archived' && <p className="mt-4 text-sm text-[var(--muted)]">项目已归档{project.externalSubmission?.externalReference ? `，外部审批单号：${project.externalSubmission.externalReference}` : '。'}</p>}
        {['interviewing', 'preaudit_needs_input'].includes(project.status) && <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">销售访谈尚未完成，后台可以查看或修订，但不能提前确认复核。</p>}
      </section>

      {['pending_external_decision', 'conditional_admission', 'tracking', 'rejected', 'tracking_completed'].includes(project.status) && (
        <ExternalApprovalPanel project={project} onProjectChange={onProjectChange} />
      )}
    </div>
  );
}
