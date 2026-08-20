'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PreauditProject } from '@/domain/preaudit/types';
import type { TrackingImportBatch } from '@/domain/preaudit/tracking-imports';
import { TRACKING_FIELD_BY_KEY } from '@/domain/preaudit/tracking-fields';

function name(project: PreauditProject) {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : project.id;
}

const IMPORT_STATUS_LABELS = {
  matched: '可导入',
  unmatched: '未匹配',
  ambiguous: '匹配歧义',
  invalid: '数据错误',
  stale: '早于现有记录',
} as const;

export default function TrackingLedgerPanel({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [projects, setProjects] = useState<PreauditProject[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [operator, setOperator] = useState('');
  const [batch, setBatch] = useState<TrackingImportBatch | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/projects').then((response) => response.json()).then((body: { projects: PreauditProject[] }) => setProjects(body.projects)).catch(() => setError('项目台账加载失败'));
  }, []);

  const rows = useMemo(() => projects.filter((project) => {
    if (!['pending_external_decision', 'conditional_admission', 'tracking', 'tracking_completed', 'rejected'].includes(project.status)) return false;
    if (status && project.status !== status) return false;
    return !query.trim() || [name(project), project.salesName, String(project.answers.salesBu?.value ?? '')].some((value) => value.includes(query.trim()));
  }), [projects, query, status]);

  async function preview(file: File) {
    setBusy('preview'); setError('');
    try {
      const form = new FormData(); form.set('file', file); form.set('createdBy', operator);
      const response = await fetch('/api/admin/tracking/imports/preview', { method: 'POST', body: form });
      const body = await response.json() as { batch?: TrackingImportBatch; error?: { message?: string } };
      if (!response.ok || !body.batch) throw new Error(body.error?.message ?? '导入预览失败');
      setBatch(body.batch);
      setSelectedRows(body.batch.preview.rows.filter((row) => row.matchStatus === 'matched').map((row) => row.rowNumber));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导入预览失败'); }
    finally { setBusy(''); }
  }

  async function confirmImport() {
    if (!batch) return;
    setBusy('confirm'); setError('');
    try {
      const response = await fetch(`/api/admin/tracking/imports/${batch.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumbers: selectedRows, confirmedBy: operator }),
      });
      const body = await response.json() as { batch?: TrackingImportBatch; error?: { message?: string } };
      if (!response.ok || !body.batch) throw new Error(body.error?.message ?? '确认导入失败');
      setBatch(body.batch);
      const refreshed = await fetch('/api/admin/projects');
      if (refreshed.ok) setProjects(((await refreshed.json()) as { projects: PreauditProject[] }).projects);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '确认导入失败'); }
    finally { setBusy(''); }
  }

  async function exportLedger() {
    setBusy('export'); setError('');
    try {
      const parameters = new URLSearchParams();
      if (status) parameters.set('status', status);
      if (query.trim()) parameters.set('query', query.trim());
      const response = await fetch(`/api/admin/tracking/export?${parameters.toString()}`);
      if (!response.ok) throw new Error('台账导出失败');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = '前置特批项目跟踪汇总.xlsx'; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '台账导出失败'); }
    finally { setBusy(''); }
  }

  return (
    <section className="p-4 sm:p-6 xl:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-xl font-bold">项目跟踪台账</h3><p className="mt-1 text-sm text-[var(--muted)]">外部审批结果、回款、利润、交付和承诺进展集中维护。</p></div>
        <button type="button" onClick={() => void exportLedger()} disabled={Boolean(busy)} className="primary-action px-4 text-sm">{busy === 'export' ? '生成中…' : '导出当前台账'}</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="mt-5 grid gap-3 border-y border-[var(--border)] py-4 md:grid-cols-[1fr_220px_220px]">
        <input aria-label="搜索跟踪项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、销售或 BU" className="product-control px-3 text-sm" />
        <select aria-label="跟踪状态筛选" value={status} onChange={(event) => setStatus(event.target.value)} className="product-control px-3 text-sm"><option value="">全部跟踪状态</option><option value="pending_external_decision">等待审批结果</option><option value="conditional_admission">有条件准入</option><option value="tracking">跟踪中</option><option value="tracking_completed">跟踪结束</option><option value="rejected">已驳回</option></select>
        <input aria-label="导入操作人" value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="导入操作人" className="product-control px-3 text-sm" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr><th className="px-4 py-3">项目</th><th className="px-4 py-3">销售 / BU</th><th className="px-4 py-3">审批状态</th><th className="px-4 py-3">跟踪期数</th><th className="px-4 py-3">最近更新</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{rows.map((project) => <tr key={project.id} className="hover:bg-[var(--surface-muted)]"><td className="px-4 py-3"><button type="button" onClick={() => onOpenProject(project.id)} className="font-bold text-[var(--brand-strong)]">{name(project)}</button></td><td className="px-4 py-3">{project.salesName}<span className="ml-2 text-xs text-[var(--muted)]">{String(project.answers.salesBu?.value ?? 'BU未填')}</span></td><td className="px-4 py-3">{project.status === 'rejected' ? '已驳回' : project.status === 'conditional_admission' ? '有条件准入' : project.status === 'pending_external_decision' ? '等待结果' : project.status === 'tracking_completed' ? '跟踪结束' : '跟踪中'}</td><td className="px-4 py-3">{project.tracking?.snapshots.length ?? 0}</td><td className="px-4 py-3 text-[var(--muted)]">{new Date(project.updatedAt).toLocaleDateString('zh-CN')}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-6 border-t border-[var(--border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">批量导入 Excel</h4><p className="mt-1 text-xs text-[var(--muted)]">先预览匹配和错误，再确认写入；空白沿用上一期，#CLEAR 表示清空。</p></div><label className={`product-control inline-flex cursor-pointer items-center px-4 text-sm font-semibold ${!operator.trim() ? 'pointer-events-none opacity-50' : ''}`}><input type="file" accept=".xlsx" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void preview(file); }} />{busy === 'preview' ? '解析中…' : '选择 Excel 文件'}</label></div>
        {batch && (
          <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-4">
            <div className="flex flex-wrap gap-4 text-sm"><strong>{batch.fileName}</strong><span>已匹配 {batch.preview.summary.matched}</span><span>未匹配 {batch.preview.summary.unmatched}</span><span>歧义 {batch.preview.summary.ambiguous}</span><span>错误 {batch.preview.summary.invalid}</span><span>过期 {batch.preview.summary.stale}</span></div>
            <h5 className="mt-4 text-sm font-bold">导入预览明细</h5>
            <div className="mt-2 max-h-[360px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="sticky top-0 bg-[var(--surface-muted)] text-[var(--muted)]">
                  <tr><th className="px-3 py-2">选择</th><th className="px-3 py-2">Excel 行</th><th className="px-3 py-2">校验状态</th><th className="px-3 py-2">匹配项目</th><th className="px-3 py-2">跟踪日期</th><th className="px-3 py-2">本次变化 / 问题</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {batch.preview.rows.map((row) => {
                    const selectable = batch.status === 'previewed' && row.matchStatus === 'matched';
                    return (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`选择第 ${row.rowNumber} 行`}
                            disabled={!selectable}
                            checked={selectedRows.includes(row.rowNumber)}
                            onChange={(event) => setSelectedRows((current) => event.target.checked
                              ? [...current, row.rowNumber]
                              : current.filter((number) => number !== row.rowNumber))}
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold">{row.rowNumber}</td>
                        <td className="px-3 py-2">{IMPORT_STATUS_LABELS[row.matchStatus]}</td>
                        <td className="px-3 py-2">{row.projectId ? name(projects.find((project) => project.id === row.projectId) ?? { id: row.projectId, answers: {} } as PreauditProject) : '—'}</td>
                        <td className="px-3 py-2">{row.effectiveDate ?? '—'}</td>
                        <td className="max-w-[420px] px-3 py-2 text-[var(--muted)]">
                          {row.errors.length > 0
                            ? row.errors.join('；')
                            : row.changes.length > 0
                              ? row.changes.map((change) => TRACKING_FIELD_BY_KEY.get(change.key)?.label ?? change.key).join('、')
                              : '没有字段变化'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {batch.status === 'previewed' && <div className="mt-3 flex justify-end"><button type="button" onClick={() => void confirmImport()} disabled={!selectedRows.length || Boolean(busy)} className="primary-action px-4 text-sm">{busy === 'confirm' ? '导入中…' : `确认导入 ${selectedRows.length} 行`}</button></div>}
            {batch.status === 'confirmed' && <p className="mt-3 text-sm font-semibold text-emerald-700">已完成导入，共处理 {batch.results.length} 行。</p>}
          </div>
        )}
      </div>
    </section>
  );
}
