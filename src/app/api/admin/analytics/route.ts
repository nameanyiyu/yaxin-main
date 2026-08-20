import { getOrganizationConfigRepository, getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { PreauditServiceError } from '@/domain/preaudit/service';
import {
  buildTrackingAnalytics,
  type AnalyticsFilters,
} from '@/domain/preaudit/tracking-analytics';

export const runtime = 'nodejs';

const statuses = new Set<NonNullable<AnalyticsFilters['status']>>([
  'tracking',
  'tracking_completed',
  'not_entered',
]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function optional(searchParams: URLSearchParams, key: string): string | undefined {
  return searchParams.get(key)?.trim() || undefined;
}

function parseFilters(url: URL): AnalyticsFilters {
  const status = optional(url.searchParams, 'status');
  const filters: AnalyticsFilters = {
    bgId: optional(url.searchParams, 'bgId'),
    buId: optional(url.searchParams, 'buId'),
    regionId: optional(url.searchParams, 'regionId'),
    salesName: optional(url.searchParams, 'salesName'),
    status: status && statuses.has(status as NonNullable<AnalyticsFilters['status']>)
      ? status as AnalyticsFilters['status']
      : undefined,
    from: optional(url.searchParams, 'from'),
    to: optional(url.searchParams, 'to'),
  };
  if (status && !filters.status) {
    throw new PreauditServiceError('INVALID_ANALYTICS_FILTER', '项目执行状态筛选值无效');
  }
  if (
    (filters.from && !datePattern.test(filters.from))
    || (filters.to && !datePattern.test(filters.to))
    || (filters.from && filters.to && filters.from > filters.to)
  ) {
    throw new PreauditServiceError('INVALID_ANALYTICS_FILTER', '项目时间范围无效');
  }
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [keyof AnalyticsFilters, string] =>
      entry[1] !== undefined),
  ) as AnalyticsFilters;
}

export async function GET(request: Request) {
  try {
    const filters = parseFilters(new URL(request.url));
    const [projects, nodes] = await Promise.all([
      (await getPreauditService()).listProjects(),
      (await getOrganizationConfigRepository()).list(),
    ]);
    const bg = filters.bgId ? nodes.find((node) => node.id === filters.bgId && node.type === 'bg') : undefined;
    const bu = filters.buId ? nodes.find((node) => node.id === filters.buId && node.type === 'bu') : undefined;
    const region = filters.regionId
      ? nodes.find((node) => node.id === filters.regionId && node.type === 'region')
      : undefined;
    if (
      (filters.bgId && !bg)
      || (filters.buId && (!bu || (bg && bu.parentId !== bg.id)))
      || (filters.regionId && (!region || (bu && region.parentId !== bu.id)))
    ) {
      throw new PreauditServiceError('INVALID_ANALYTICS_FILTER', '组织筛选层级组合无效');
    }
    const analytics = buildTrackingAnalytics(projects, nodes, filters);
    return jsonResponse({
      filters,
      organization: { nodes },
      ...analytics,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
