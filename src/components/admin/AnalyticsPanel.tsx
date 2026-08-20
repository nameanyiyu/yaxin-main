'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OrganizationNode } from '@/domain/preaudit/organization-config';
import type {
  AnalyticsFilters,
  TrackingAnalyticsResult,
  TrackingAnalyticsWarning,
} from '@/domain/preaudit/tracking-analytics';

interface Props {
  onOpenProject: (projectId: string) => void;
}

type AnalyticsResponse = TrackingAnalyticsResult & {
  filters: AnalyticsFilters;
  organization: { nodes: OrganizationNode[] };
};

const WARNING_LABELS: Record<TrackingAnalyticsWarning['ruleId'], string> = {
  HUMAN_BREACHED: '人工确认未达成',
  HUMAN_AT_RISK: '人工高风险预警',
  COLLECTION_REACHED_CONTRACT: '建议结束跟踪',
  FORECAST_GM1_BELOW_APPROVED: '预测利润低于审批',
  RECEIVABLE_OVERDUE: '应收已逾期',
  MILESTONE_OVERDUE: '里程碑已逾期',
};

export function formatAnalyticsRatio(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export function warningLabel(ruleId: TrackingAnalyticsWarning['ruleId']): string {
  return WARNING_LABELS[ruleId];
}

async function apiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? '数据读取失败';
  } catch {
    return '数据读取失败';
  }
}

function queryString(filters: AnalyticsFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

function DistributionRow({
  label,
  count,
  total,
  tone = 'brand',
}: {
  label: string;
  count: number;
  total: number;
  tone?: 'brand' | 'danger' | 'warning' | 'muted' | 'success';
}) {
  const percent = total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
  const tones = {
    brand: 'bg-[var(--brand)]',
    danger: 'bg-[var(--danger)]',
    warning: 'bg-[var(--warning)]',
    muted: 'bg-slate-400',
    success: 'bg-[var(--success)]',
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-[var(--muted)]">
          <strong className="text-[var(--ink)]">{count}</strong> / {total}，{total ? `${percent}%` : '—'}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
      >
        <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 p-4 md:p-8" aria-busy="true" aria-label="正在读取统计数据">
      <div className="h-28 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
      <div className="h-64 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
      <div className="h-80 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
    </div>
  );
}

export default function AnalyticsPanel({ onOpenProject }: Props) {
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/analytics?${queryString(filters)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response));
        return response.json() as Promise<AnalyticsResponse>;
      })
      .then((responseData) => {
        setData(responseData);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '数据读取失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, refreshKey]);

  const nodes = data?.organization.nodes ?? [];
  const bgs = nodes.filter((node) => node.type === 'bg' && node.enabled);
  const bus = nodes.filter((node) =>
    node.type === 'bu' && node.enabled && (!filters.bgId || node.parentId === filters.bgId));
  const regions = nodes.filter((node) =>
    node.type === 'region' && node.enabled && (!filters.buId || node.parentId === filters.buId));
  const salesNames = useMemo(
    () => [...new Set(data?.projects.map((project) => project.salesName) ?? [])].toSorted((a, b) =>
      a.localeCompare(b, 'zh-CN')),
    [data],
  );

  function updateFilters(changes: Partial<AnalyticsFilters>) {
    setFilters((current) => ({ ...current, ...changes }));
  }

  function openGroup(id: string) {
    if (!data) return;
    if (data.groupKind === 'bg') {
      updateFilters({ bgId: id, buId: undefined, regionId: undefined, salesName: undefined });
    } else if (data.groupKind === 'bu') {
      updateFilters({ buId: id, regionId: undefined, salesName: undefined });
    } else if (data.groupKind === 'sales') {
      updateFilters({ salesName: id });
    } else {
      onOpenProject(id);
    }
  }

  if (loading && !data) return <LoadingState />;

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-[1500px]">
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="product-control px-3 text-xs font-semibold">
              重新加载
            </button>
          </div>
        )}

        <section className="product-surface overflow-hidden" aria-labelledby="analytics-filters-heading">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h3 id="analytics-filters-heading" className="font-bold">统计范围</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">全部指标、分布、下钻和预警使用同一筛选范围。</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFilters({})} className="product-control px-3 text-sm font-semibold">重置筛选</button>
              <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="primary-action px-3 text-sm">{loading ? '刷新中…' : '刷新数据'}</button>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label className="text-xs font-semibold text-[var(--muted)]">BG
              <select value={filters.bgId ?? ''} onChange={(event) => updateFilters({ bgId: event.target.value || undefined, buId: undefined, regionId: undefined, salesName: undefined })} className="product-control mt-1 w-full px-3 text-sm">
                <option value="">全部 BG</option>
                {bgs.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">BU
              <select value={filters.buId ?? ''} onChange={(event) => updateFilters({ buId: event.target.value || undefined, regionId: undefined, salesName: undefined })} className="product-control mt-1 w-full px-3 text-sm">
                <option value="">全部 BU</option>
                {bus.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">销售区域
              <select value={filters.regionId ?? ''} onChange={(event) => updateFilters({ regionId: event.target.value || undefined, salesName: undefined })} className="product-control mt-1 w-full px-3 text-sm">
                <option value="">全部区域</option>
                {regions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">销售人员
              <select value={filters.salesName ?? ''} onChange={(event) => updateFilters({ salesName: event.target.value || undefined })} className="product-control mt-1 w-full px-3 text-sm">
                <option value="">全部销售</option>
                {salesNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">执行状态
              <select value={filters.status ?? ''} onChange={(event) => updateFilters({ status: event.target.value as AnalyticsFilters['status'] || undefined })} className="product-control mt-1 w-full px-3 text-sm">
                <option value="">全部状态</option>
                <option value="tracking">执行中</option>
                <option value="tracking_completed">已执行完成</option>
                <option value="not_entered">未进入执行</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-[var(--muted)]">开始日期
                <input type="date" value={filters.from ?? ''} onChange={(event) => updateFilters({ from: event.target.value || undefined })} className="product-control mt-1 w-full px-2 text-xs" />
              </label>
              <label className="text-xs font-semibold text-[var(--muted)]">结束日期
                <input type="date" value={filters.to ?? ''} onChange={(event) => updateFilters({ to: event.target.value || undefined })} className="product-control mt-1 w-full px-2 text-xs" />
              </label>
            </div>
          </div>
        </section>

        {data && (
          <>
            <section className="mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="analytics-summary-heading">
              <div className="grid lg:grid-cols-[260px_1fr]">
                <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-5 lg:border-b-0 lg:border-r">
                  <p className="text-xs font-semibold text-[var(--muted)]">OT 上报总量</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{data.metrics.otTotal}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">进入外部审批及之后的全部项目。</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-3">
                  {[
                    ['已进入执行', data.metrics.enteredExecution, '跟踪中与跟踪已结束'],
                    ['已执行完成', data.metrics.completed, formatAnalyticsRatio(data.ratios.completed)],
                    ['执行中', data.metrics.tracking, formatAnalyticsRatio(data.ratios.tracking)],
                    ['未进入执行', data.metrics.notEnteredExecution, '等待、条件准入或驳回'],
                    ['建议结束跟踪', data.metrics.suggestedCompletion, '回款达到合同金额'],
                    ['承诺按期达成', data.completedDistribution.achieved, formatAnalyticsRatio(data.ratios.commitmentAchieved)],
                  ].map(([label, value, detail]) => (
                    <div key={String(label)} className="min-h-24 px-4 py-4">
                      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <h3 id="analytics-summary-heading" className="sr-only">统计概览</h3>
            </section>

            <section className="product-surface mt-5 p-5" aria-labelledby="distribution-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id="distribution-heading" className="font-bold">执行结果分布</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">完成项目看最终承诺结论，执行中项目看最近一期人工判断。</p>
                </div>
                <span className="text-xs text-[var(--muted)]">比例分母随当前筛选范围变化</span>
              </div>
              <div className="mt-5 grid gap-8 lg:grid-cols-2 lg:divide-x lg:divide-[var(--border)]">
                <div>
                  <h4 className="text-sm font-bold">已执行完成（{data.metrics.completed}）</h4>
                  <div className="mt-4 space-y-4">
                    <DistributionRow label="承诺按期达成" count={data.completedDistribution.achieved} total={data.metrics.completed} tone="success" />
                    <DistributionRow label="承诺未达成" count={data.completedDistribution.notAchieved} total={data.metrics.completed} tone="danger" />
                    <DistributionRow label="历史待补录" count={data.completedDistribution.pendingEntry} total={data.metrics.completed} tone="muted" />
                  </div>
                </div>
                <div className="lg:pl-8">
                  <h4 className="text-sm font-bold">执行中（{data.metrics.tracking}）</h4>
                  <div className="mt-4 space-y-4">
                    <DistributionRow label="正常执行" count={data.trackingDistribution.normal} total={data.metrics.tracking} tone="success" />
                    <DistributionRow label="明确承诺未达成" count={data.trackingDistribution.breached} total={data.metrics.tracking} tone="danger" />
                    <DistributionRow label="高风险预警" count={data.trackingDistribution.atRisk} total={data.metrics.tracking} tone="warning" />
                    <DistributionRow label="尚未维护" count={data.trackingDistribution.unmaintained} total={data.metrics.tracking} tone="muted" />
                  </div>
                </div>
              </div>
            </section>

            <section className="product-surface mt-5 overflow-hidden" aria-labelledby="drilldown-heading">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h3 id="drilldown-heading" className="font-bold">组织下钻</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
                    <button type="button" onClick={() => setFilters((current) => ({ ...current, bgId: undefined, buId: undefined, regionId: undefined, salesName: undefined }))} className="font-semibold text-[var(--brand-strong)]">全部 BG</button>
                    {filters.bgId && <><span>/</span><button type="button" onClick={() => setFilters((current) => ({ ...current, buId: undefined, regionId: undefined, salesName: undefined }))} className="font-semibold text-[var(--brand-strong)]">{nodes.find((node) => node.id === filters.bgId)?.name}</button></>}
                    {filters.buId && <><span>/</span><button type="button" onClick={() => setFilters((current) => ({ ...current, salesName: undefined }))} className="font-semibold text-[var(--brand-strong)]">{nodes.find((node) => node.id === filters.buId)?.name}</button></>}
                    {filters.salesName && <><span>/</span><span>{filters.salesName}</span></>}
                  </div>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                  当前层级：{data.groupKind === 'bg' ? 'BG' : data.groupKind === 'bu' ? 'BU' : data.groupKind === 'sales' ? '销售人员' : '项目'}
                </span>
              </div>
              {data.groups.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="font-semibold">当前范围没有 OT 项目</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">调整组织、日期或执行状态筛选后再查看。</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[820px] w-full text-left text-sm">
                    <thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]">
                      <tr>
                        <th className="px-5 py-3 font-semibold">{data.groupKind === 'bg' ? 'BG' : data.groupKind === 'bu' ? 'BU' : data.groupKind === 'sales' ? '销售人员' : '项目'}</th>
                        <th className="px-4 py-3 text-right font-semibold">OT 总量</th>
                        <th className="px-4 py-3 text-right font-semibold">执行中</th>
                        <th className="px-4 py-3 text-right font-semibold">已完成</th>
                        <th className="px-4 py-3 text-right font-semibold">承诺未达成</th>
                        <th className="px-4 py-3 text-right font-semibold">高风险</th>
                        <th className="px-5 py-3 text-right font-semibold">建议结束</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.groups.map((group) => (
                        <tr key={group.id} className="hover:bg-[var(--surface-muted)]">
                          <td className="px-5 py-3"><button type="button" onClick={() => openGroup(group.id)} className="font-bold text-[var(--brand-strong)] hover:underline">{group.label}</button></td>
                          <td className="px-4 py-3 text-right tabular-nums">{group.otTotal}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{group.tracking}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{group.completed}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{group.commitmentNotAchieved}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{group.atRisk}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{group.suggestedCompletion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="product-surface mt-5 overflow-hidden" aria-labelledby="warnings-heading">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <h3 id="warnings-heading" className="font-bold">预警与待办（{data.warnings.length}）</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">人工结论与系统规则并列展示，系统提示不会覆盖人工分类。</p>
              </div>
              {data.warnings.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">当前筛选范围没有执行预警。</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.warnings.map((item, index) => (
                    <li key={`${item.projectId}-${item.ruleId}-${index}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[170px_1fr_220px_auto] lg:items-center">
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${item.severity === 'high' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          {item.severity === 'high' ? '高风险' : '提醒'}
                        </span>
                        <p className="mt-1 text-xs font-semibold">{warningLabel(item.ruleId)}</p>
                      </div>
                      <div>
                        <button type="button" onClick={() => onOpenProject(item.projectId)} className="font-bold text-[var(--brand-strong)] hover:underline">{item.projectName}</button>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.reason}</p>
                      </div>
                      <p className="text-xs text-[var(--muted)]">{item.bgName} / {item.buName}<br />{item.salesName}{item.latestTrackingDate ? ` · ${item.latestTrackingDate}` : ''}</p>
                      <button type="button" onClick={() => onOpenProject(item.projectId)} className="product-control px-3 text-xs font-semibold">打开项目</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
