'use client';

import { useEffect, useState } from 'react';

interface TemplateSummary {
  id: string;
  version: string;
  name: string;
  fileName: string;
  token: string;
  fieldCount: number;
  builtin: boolean;
  sharePath: string;
  sourcePath: string;
  format?: 'xlsx' | 'markdown';
}

export default function TemplatesPanel() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({ name: '', version: '', token: '', file: null as File | null });
  const [editDraft, setEditDraft] = useState({ name: '', version: '' });

  async function loadTemplates(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/templates', { signal });
      if (!response.ok) throw new Error('审批模板加载失败');
      setTemplates((await response.json()) as TemplateSummary[]);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '审批模板加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/templates', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('审批模板加载失败');
        setTemplates((await response.json()) as TemplateSummary[]);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '审批模板加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function responseMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return body.error?.message || '操作失败';
    } catch {
      return '操作失败';
    }
  }

  async function copyLink(template: TemplateSummary) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${template.sharePath}`);
      setNotice('销售填写链接已复制');
    } catch {
      setNotice('浏览器未允许复制，请手动复制销售入口');
    }
  }

  async function createTemplate() {
    setBusy('create'); setError(''); setNotice('');
    try {
      const formData = new FormData();
      formData.set('name', createDraft.name);
      formData.set('version', createDraft.version);
      formData.set('token', createDraft.token);
      if (createDraft.file) formData.set('file', createDraft.file);
      const response = await fetch('/api/admin/templates', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadTemplates();
      setCreateDraft({ name: '', version: '', token: '', file: null });
      setCreating(false);
      setNotice('审批模板已创建，销售入口可以立即使用');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审批模板创建失败');
    } finally {
      setBusy('');
    }
  }

  function beginEdit(template: TemplateSummary) {
    setEditingId(template.id);
    setEditDraft({ name: template.name, version: template.version });
    setError('');
  }

  async function updateTemplate(id: string) {
    setBusy(`edit:${id}`); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadTemplates();
      setEditingId(null);
      setNotice('模板名称和版本已更新');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审批模板更新失败');
    } finally {
      setBusy('');
    }
  }

  async function deleteTemplate(template: TemplateSummary) {
    if (!window.confirm(`确定删除模板“${template.name}”吗？已有项目引用时系统会阻止删除。`)) return;
    setBusy(`delete:${template.id}`); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/templates/${template.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseMessage(response));
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice('审批模板已删除');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审批模板删除失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div>
          <h3 className="text-xl font-bold tracking-tight">审批模板</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            2026-08 版本按云文档 Markdown 模板填写和下载；历史版本仍保留 Excel 兼容入口。销售链接标识创建后不可修改。
          </p>
        </div>
        <button type="button" onClick={() => setCreating((current) => !current)} className="primary-action px-4 text-sm">
          {creating ? '取消新增' : '新增审批模板'}
        </button>
      </div>

      {creating && (
        <section className="product-surface mt-4 p-5" aria-labelledby="create-template-heading">
          <h4 id="create-template-heading" className="font-bold">新增审批模板</h4>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">不上传文件时复制内置历史 Excel 原表；2026-08 Markdown 模板由系统按发布文件维护。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-semibold">模板名称<input value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} className="product-control mt-1 w-full px-3 font-normal" placeholder="例如：政企项目审批表" /></label>
            <label className="text-sm font-semibold">版本<input value={createDraft.version} onChange={(event) => setCreateDraft((current) => ({ ...current, version: event.target.value }))} className="product-control mt-1 w-full px-3 font-normal" placeholder="例如：2026-01" /></label>
            <label className="text-sm font-semibold">销售链接标识<input value={createDraft.token} onChange={(event) => setCreateDraft((current) => ({ ...current, token: event.target.value.toLowerCase() }))} className="product-control mt-1 w-full px-3 font-mono font-normal" placeholder="例如：government-2026" /></label>
            <label className="text-sm font-semibold md:col-span-2">兼容的 Excel 原表（可选）<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setCreateDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} className="product-control mt-1 w-full px-3 py-2 font-normal" /></label>
            <div className="flex items-end"><button type="button" onClick={() => void createTemplate()} disabled={busy === 'create' || !createDraft.name.trim() || !createDraft.version.trim() || !createDraft.token.trim()} className="primary-action w-full px-4 text-sm">{busy === 'create' ? '创建中…' : '确认创建模板'}</button></div>
          </div>
        </section>
      )}

      {notice && <p role="status" className="mt-5 rounded-xl border border-[var(--brand)]/20 bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-strong)]">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {loading ? (
        <div className="product-surface mt-6 p-6"><p className="text-sm text-[var(--muted)]">正在读取模板…</p></div>
      ) : (
        <div className="product-surface mt-6 divide-y divide-[var(--border)] overflow-hidden">
          {templates.map((template) => (
            <article key={template.id} className="px-5 py-6">
              {editingId === template.id ? (
                <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
                  <label className="text-sm font-semibold">模板名称<input value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} className="product-control mt-1 w-full px-3 font-normal" /></label>
                  <label className="text-sm font-semibold">版本<input value={editDraft.version} onChange={(event) => setEditDraft((current) => ({ ...current, version: event.target.value }))} className="product-control mt-1 w-full px-3 font-normal" /></label>
                  <div className="flex gap-2"><button type="button" onClick={() => void updateTemplate(template.id)} disabled={busy === `edit:${template.id}`} className="primary-action px-4 text-sm">{busy === `edit:${template.id}` ? '保存中…' : '保存'}</button><button type="button" onClick={() => setEditingId(null)} className="product-control px-4 text-sm font-semibold">取消</button></div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] font-bold text-[var(--brand-strong)]">▤</div>
                      <h4 className="font-semibold text-[var(--ink)]">{template.name}</h4>
                      <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">版本 {template.version}</span>
                      {template.builtin && <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">内置</span>}
                    </div>
                    <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-[var(--muted)]">源文件</dt><dd className="mt-1 font-medium">{template.fileName}</dd></div>
                      <div><dt className="text-[var(--muted)]">采集字段</dt><dd className="mt-1 font-medium">{template.fieldCount} 项</dd></div>
                      <div className="sm:col-span-2"><dt className="text-[var(--muted)]">销售入口</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--brand-strong)]">{template.sharePath}</dd></div>
                    </dl>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={template.sharePath} target="_blank" rel="noreferrer" className="product-control inline-flex items-center px-3 text-xs font-semibold hover:bg-[var(--surface-muted)]">打开填写页</a>
                    <button type="button" onClick={() => void copyLink(template)} className="primary-action px-3 text-xs">复制链接</button>
                    <a href={template.sourcePath} className="product-control inline-flex items-center px-3 text-xs font-semibold hover:bg-[var(--surface-muted)]">下载原表</a>
                    {!template.builtin && <button type="button" onClick={() => beginEdit(template)} className="product-control px-3 text-xs font-semibold">编辑</button>}
                    {!template.builtin && <button type="button" onClick={() => void deleteTemplate(template)} disabled={busy === `delete:${template.id}`} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{busy === `delete:${template.id}` ? '删除中…' : '删除'}</button>}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
