'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { presentProject } from '@/domain/preaudit/presentation';
import type { PreauditProject } from '@/domain/preaudit/types';
import {
  filterAdminProjects,
  projectAction,
  summarizeAdminProjects,
} from '@/lib/admin-workbench';

interface Props {
  onOpenProject: (projectId: string) => void;
  onOpenProjects: () => void;
}

function contractName(project: PreauditProject): string {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : '未填写合同名称';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

const ACTION_TONE = {
  brand: 'bg-[var(--brand-soft)] text-[var(--brand-strong)]',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-800',
  muted: 'bg-[var(--surface-muted)] text-[var(--muted)]',
  success: 'bg-emerald-50 text-emerald-800',
} as const;

export default function OverviewPanel({ onOpenProject, onOpenProjects }: Props) {
  const [projects, setProjects] = useState<PreauditProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/projects', { signal });
      if (!response.ok) throw new Error('管理总览加载失败');
      const data = (await response.json()) as { projects: PreauditProject[] };
      setProjects(data.projects);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '管理总览加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => summarizeAdminProjects(projects), [projects]);
  const queue = useMemo(
    () => filterAdminProjects(projects, {
      query: '',
      status: '',
      risk: 'all',
      sort: 'priority',
    }).filter((project) => project.status !== 'archived').slice(0, 8),
    [projects],
  );

  return (
    <section className="mx-auto max-w-[1440px] p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--brand-strong)]">今日工作台</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight">合同前置审批总览</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">只展示真实项目状态，按需要后台处理的紧急程度排序。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="product-control px-4 text-sm font-semibold">
            刷新数据
          </button>
          <button type="button" onClick={onOpenProjects} className="primary-action px-4 text-sm">
            进入项目复核
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      <div className="product-surface mt-6 grid divide-y divide-[var(--border)] overflow-hidden sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <div className="p-5">
          <p className="text-xs font-semibold text-[var(--muted)]">进行中项目</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{loading ? '—' : summary.active}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">全部 {summary.total} 项，已归档 {summary.archived} 项</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-semibold text-[var(--muted)]">等待后台复核</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--brand-strong)]">{loading ? '—' : summary.awaitingReview}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">信息完整，等待复核人确认</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-semibold text-[var(--muted)]">待导出 / 待归档</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{loading ? '—' : `${summary.awaitingExport} / ${summary.awaitingArchive}`}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">外部审批仍需人工提交</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-semibold text-[var(--muted)]">含绝对禁止风险</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-red-700">{loading ? '—' : summary.blockingRisk}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">另有 {summary.needsInput} 项等待销售信息补充</p>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <h4 className="text-lg font-bold">待办队列</h4>
          <p className="mt-1 text-sm text-[var(--muted)]">绝对禁止风险、待复核、待导出和待人工提交优先显示。</p>
        </div>
        <button type="button" onClick={onOpenProjects} className="text-sm font-semibold text-[var(--brand-strong)]">
          查看全部
        </button>
      </div>

      <div className="product-surface mt-4 overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-[var(--muted)]">正在读取真实项目数据…</div>
        ) : queue.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">✓</div>
            <p className="mt-4 font-semibold">当前没有待处理项目</p>
            <p className="mt-1 text-sm text-[var(--muted)]">销售提交新项目后会自动进入这里。</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {queue.map((project) => {
              const action = projectAction(project);
              const view = presentProject(project);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="grid w-full gap-4 px-5 py-4 text-left hover:bg-[var(--surface-muted)] md:grid-cols-[minmax(0,1.3fr)_minmax(180px,.7fr)_150px_120px] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{contractName(project)}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">销售：{project.salesName} · 更新 {formatDate(project.updatedAt)}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_TONE[action.tone]}`}>
                      {action.label}
                    </span>
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{action.description}</p>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    必填 <b className="text-[var(--ink)]">{view.progress.completed}/{view.progress.total}</b>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${view.progress.percent}%` }} />
                    </div>
                  </div>
                  <div className={view.triggeredRiskCount ? 'text-sm font-semibold text-red-700' : 'text-sm text-[var(--muted)]'}>
                    风险 {view.triggeredRiskCount} 项
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
