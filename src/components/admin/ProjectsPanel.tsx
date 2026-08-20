'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { presentProject, PROJECT_STATUS_LABELS } from '@/domain/preaudit/presentation';
import type { PreauditProject, ProjectStatus } from '@/domain/preaudit/types';
import {
  filterAdminProjects,
  projectAction,
  type AdminProjectSort,
  type AdminRiskFilter,
} from '@/lib/admin-workbench';
import ProjectReviewPanel from './ProjectReviewPanel';

const STATUS_OPTIONS: Array<{ value: '' | ProjectStatus; label: string }> = [
  { value: '', label: '全部状态' },
  ...Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value: value as ProjectStatus, label })),
];

function contractName(project: PreauditProject): string {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : '未填写合同名称';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

interface TemplateOption {
  id: string;
  name: string;
  version: string;
}

export default function ProjectsPanel({ initialSelectedId = null }: { initialSelectedId?: string | null }) {
  const [projects, setProjects] = useState<PreauditProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialSelectedId));
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [risk, setRisk] = useState<AdminRiskFilter>('all');
  const [sort, setSort] = useState<AdminProjectSort>('priority');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [busy, setBusy] = useState('');
  const [createDraft, setCreateDraft] = useState({ contractName: '', salesName: '', templateId: '' });
  const [editDraft, setEditDraft] = useState({ contractName: '', salesName: '', status: 'interviewing' as ProjectStatus });

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/projects', { signal });
      if (!response.ok) throw new Error('项目列表加载失败');
      const data = (await response.json()) as { projects: PreauditProject[] };
      setProjects(data.projects);
      setSelectedId((current) => {
        if (initialSelectedId && data.projects.some((item) => item.id === initialSelectedId)) return initialSelectedId;
        if (current && data.projects.some((item) => item.id === current)) return current;
        return null;
      });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '项目列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [initialSelectedId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void loadProjects(controller.signal));
    return () => controller.abort();
  }, [loadProjects]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/templates', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('审批模板加载失败');
        return (await response.json()) as TemplateOption[];
      })
      .then((items) => {
        setTemplates(items);
        setCreateDraft((current) => ({ ...current, templateId: current.templateId || items[0]?.id || '' }));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '审批模板加载失败');
      });
    return () => controller.abort();
  }, []);

  const visibleProjects = useMemo(
    () => filterAdminProjects(projects, { query, status, risk, sort }),
    [projects, query, risk, sort, status],
  );

  function syncProject(project: PreauditProject) {
    setProjects((current) => current.map((item) => item.id === project.id ? project : item));
  }

  async function responseMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return body.error?.message || '操作失败';
    } catch {
      return '操作失败';
    }
  }

  async function createProject() {
    setBusy('create'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const { project } = (await response.json()) as { project: PreauditProject };
      setProjects((current) => [project, ...current]);
      setSelectedId(project.id);
      setMobileDetailOpen(true);
      setCreating(false);
      setCreateDraft({ contractName: '', salesName: '', templateId: templates[0]?.id || '' });
      setNotice('项目已创建');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目创建失败');
    } finally {
      setBusy('');
    }
  }

  function beginEditProject(project: PreauditProject) {
    setEditDraft({
      contractName: contractName(project),
      salesName: project.salesName,
      status: project.status,
    });
    setEditingProject(true);
    setError('');
  }

  async function updateProject(projectId: string) {
    setBusy('edit'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: editDraft }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const { project } = (await response.json()) as { project: PreauditProject };
      syncProject(project);
      setEditingProject(false);
      setNotice('项目管理信息已更新');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目更新失败');
    } finally {
      setBusy('');
    }
  }

  async function deleteProject(project: PreauditProject) {
    if (!window.confirm(`确定永久删除“${contractName(project)}”吗？该操作无法撤销。`)) return;
    setBusy('delete'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseMessage(response));
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setSelectedId(null);
      setEditingProject(false);
      setMobileDetailOpen(false);
      setNotice('项目已删除');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目删除失败');
    } finally {
      setBusy('');
    }
  }

  const selected = visibleProjects.find((project) => project.id === selectedId) ?? visibleProjects[0];
  const filtersActive = Boolean(query.trim() || status || risk !== 'all');

  return (
    <section className="grid min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className={`${mobileDetailOpen ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]`}>
        <div className="sticky top-0 z-10 space-y-3 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">项目队列</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">显示 {visibleProjects.length} / {projects.length} 项</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCreating((current) => !current)} className="primary-action min-h-9 px-3 text-xs">
                {creating ? '取消' : '新建项目'}
              </button>
              <button type="button" onClick={() => void loadProjects()} className="text-sm font-semibold text-[var(--brand-strong)]">刷新</button>
            </div>
          </div>

          {creating && (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className="text-xs font-bold">新建项目</p>
              <input aria-label="新项目名称" value={createDraft.contractName} onChange={(event) => setCreateDraft((current) => ({ ...current, contractName: event.target.value }))} className="product-control w-full px-3 text-sm" placeholder="项目或合同名称" />
              <input aria-label="新项目销售姓名" value={createDraft.salesName} onChange={(event) => setCreateDraft((current) => ({ ...current, salesName: event.target.value }))} className="product-control w-full px-3 text-sm" placeholder="销售姓名" />
              <select aria-label="新项目审批模板" value={createDraft.templateId} onChange={(event) => setCreateDraft((current) => ({ ...current, templateId: event.target.value }))} className="product-control w-full px-3 text-sm">
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.version}</option>)}
              </select>
              <button type="button" onClick={() => void createProject()} disabled={busy === 'create' || !createDraft.contractName.trim() || !createDraft.salesName.trim() || !createDraft.templateId} className="primary-action w-full px-3 text-sm">
                {busy === 'create' ? '创建中…' : '确认创建'}
              </button>
            </div>
          )}

          <label className="relative block">
            <span className="sr-only">搜索项目</span>
            <span className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="product-control w-full pl-9 pr-3 text-sm"
              placeholder="搜索合同、销售或项目编号"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="项目状态"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | ProjectStatus)}
              className="product-control px-3 text-sm"
            >
              {STATUS_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
            <select
              aria-label="风险筛选"
              value={risk}
              onChange={(event) => setRisk(event.target.value as AdminRiskFilter)}
              className="product-control px-3 text-sm"
            >
              <option value="all">全部风险</option>
              <option value="blocking">仅绝对禁止风险</option>
              <option value="triggered">有风险提示</option>
              <option value="clear">无已触发风险</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="项目排序"
              value={sort}
              onChange={(event) => setSort(event.target.value as AdminProjectSort)}
              className="product-control min-w-0 flex-1 px-3 text-sm"
            >
              <option value="priority">按处理优先级</option>
              <option value="updated_desc">按最近更新</option>
              <option value="risk_desc">按风险数量</option>
              <option value="progress_asc">按完成度从低到高</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatus('');
                  setRisk('all');
                }}
                className="shrink-0 px-2 text-xs font-semibold text-[var(--brand-strong)]"
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas)] p-3">
          {notice && <p role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}
          {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
          {loading && <p className="p-4 text-sm text-[var(--muted)]">正在读取项目…</p>}
          {!loading && visibleProjects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">◎</div>
              <p className="mt-4 font-semibold">{projects.length ? '没有符合条件的项目' : '当前还没有项目'}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {projects.length ? '调整搜索条件或清除筛选后重试。' : '销售通过固定分享链接开始访谈后，项目会显示在这里。'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {visibleProjects.map((project) => {
              const view = presentProject(project);
              const action = projectAction(project);
              const isSelected = selected?.id === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(project.id);
                    setMobileDetailOpen(true);
                  }}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-left ${
                    isSelected
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] shadow-[0_8px_24px_oklch(0.49_0.17_264/0.10)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/35 hover:bg-[var(--surface)]'
                  }`}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-bold leading-5">{contractName(project)}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                      project.status === 'pending_review'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-[var(--surface-muted)] text-[var(--muted)]'
                    }`}>
                      {view.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">{project.salesName} · {formatTime(project.updatedAt)} 更新</p>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-[var(--brand-strong)]">{action.label}</span>
                    <span className={view.triggeredRiskCount ? 'font-bold text-red-700' : 'text-[var(--muted)]'}>
                      {view.triggeredRiskCount ? `${view.triggeredRiskCount} 项风险` : '暂无风险'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${view.progress.percent}%` }} />
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-[var(--muted)]">{view.progress.percent}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${mobileDetailOpen ? 'block' : 'hidden lg:block'} min-w-0 bg-[var(--canvas)] lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain`}>
        {mobileDetailOpen && (
          <div className="sticky top-16 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="product-control inline-flex min-h-9 items-center px-3 text-sm font-semibold"
            >
              ← 返回项目列表
            </button>
          </div>
        )}
        {selected ? (
          <>
            <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 xl:px-6">
              {editingProject ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input aria-label="编辑项目名称" value={editDraft.contractName} onChange={(event) => setEditDraft((current) => ({ ...current, contractName: event.target.value }))} className="product-control px-3 text-sm" />
                  <input aria-label="编辑销售姓名" value={editDraft.salesName} onChange={(event) => setEditDraft((current) => ({ ...current, salesName: event.target.value }))} className="product-control px-3 text-sm" />
                  <select aria-label="编辑项目状态" value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value as ProjectStatus }))} className="product-control px-3 text-sm">
                    {STATUS_OPTIONS.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="button" onClick={() => void updateProject(selected.id)} disabled={busy === 'edit'} className="primary-action px-4 text-sm">{busy === 'edit' ? '保存中…' : '保存项目信息'}</button>
                    <button type="button" onClick={() => setEditingProject(false)} className="product-control px-4 text-sm font-semibold">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--muted)]">管理员可修正项目名称、销售归属和流程状态。</p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => beginEditProject(selected)} className="product-control min-h-9 px-3 text-xs font-semibold">编辑项目</button>
                    <button type="button" onClick={() => void deleteProject(selected)} disabled={busy === 'delete'} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{busy === 'delete' ? '删除中…' : '删除'}</button>
                  </div>
                </div>
              )}
            </div>
            <ProjectReviewPanel key={`${selected.id}:${selected.updatedAt}`} project={selected} onProjectChange={syncProject} />
          </>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-[var(--muted)]">
            选择一个项目查看复核详情
          </div>
        )}
      </div>
    </section>
  );
}
