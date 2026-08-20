import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOrganizationConfig } from '../organization-config';

const service = { listProjects: vi.fn() };
const organizationRepository = { list: vi.fn() };

vi.mock('../bootstrap', () => ({
  getPreauditService: vi.fn(async () => service),
  getOrganizationConfigRepository: vi.fn(async () => organizationRepository),
}));

describe('analytics route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listProjects.mockResolvedValue([]);
    organizationRepository.list.mockResolvedValue(
      defaultOrganizationConfig('2026-07-30T00:00:00.000Z'),
    );
  });

  it('returns server-side aggregates for linked filters', async () => {
    const { GET } = await import('@/app/api/admin/analytics/route');
    const response = await GET(new Request(
      'http://localhost/api/admin/analytics?bgId=bg-tsg&buId=bu-tsg-cmc&status=tracking',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters).toEqual({
      bgId: 'bg-tsg',
      buId: 'bu-tsg-cmc',
      status: 'tracking',
    });
    expect(body.metrics).toMatchObject({ otTotal: 0, tracking: 0, completed: 0 });
    expect(body.organization).toHaveProperty('nodes');
    expect(service.listProjects).toHaveBeenCalledOnce();
  });

  it('rejects invalid date ranges', async () => {
    const { GET } = await import('@/app/api/admin/analytics/route');
    const response = await GET(new Request(
      'http://localhost/api/admin/analytics?from=2026-08-01&to=2026-07-01',
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_ANALYTICS_FILTER' },
    });
  });

  it('rejects mismatched BG and BU filters', async () => {
    const { GET } = await import('@/app/api/admin/analytics/route');
    const response = await GET(new Request(
      'http://localhost/api/admin/analytics?bgId=bg-dig&buId=bu-tsg-cmc',
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_ANALYTICS_FILTER' },
    });
  });
});
