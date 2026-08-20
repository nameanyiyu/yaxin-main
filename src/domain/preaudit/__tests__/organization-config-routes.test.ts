import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOrganizationConfig } from '../organization-config';

const repository = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  restoreDefaults: vi.fn(),
};
const template = {
  id: 'template-1',
  version: '2025-11',
  name: '审批模板',
  token: 'preaudit202511',
  fields: [],
};

vi.mock('../bootstrap', () => ({
  getOrganizationConfigRepository: vi.fn(async () => repository),
  getTemplateByToken: vi.fn(async () => template),
}));

describe('organization config routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.list.mockResolvedValue(defaultOrganizationConfig('2026-07-30T00:00:00.000Z'));
  });

  it('returns enabled organization hierarchy with the sales template', async () => {
    const { GET } = await import('@/app/api/s/[token]/route');
    const response = await GET(
      new Request('http://localhost/api/s/preaudit202511'),
      { params: Promise.resolve({ token: 'preaudit202511' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organization.bgs.map((node: { name: string }) => node.name)).toEqual([
      'TSG', 'DIG', 'SIG', 'CSU',
    ]);
    expect(body.organization.bus.find((node: { name: string }) => node.name === 'AIS'))
      .toMatchObject({ parentId: 'bg-dig' });
  });

  it('lists and creates configuration nodes', async () => {
    const route = await import('@/app/api/admin/organization-config/route');
    const nodes = await repository.list();
    const cmc = nodes.find((node: { name: string }) => node.name === 'CMC');
    repository.create.mockResolvedValue({
      id: 'region-east',
      type: 'region',
      name: '华东区',
      parentId: cmc.id,
      enabled: true,
      sortOrder: 0,
    });

    const listResponse = await route.GET();
    const createResponse = await route.POST(new Request(
      'http://localhost/api/admin/organization-config',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'region', name: '华东区', parentId: cmc.id }),
      },
    ));

    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).nodes).toHaveLength(nodes.length);
    expect(createResponse.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({
      type: 'region',
      name: '华东区',
      parentId: cmc.id,
      enabled: undefined,
      sortOrder: undefined,
    });
  });

  it('updates and restores organization configuration', async () => {
    const patchRoute = await import('@/app/api/admin/organization-config/[id]/route');
    const collectionRoute = await import('@/app/api/admin/organization-config/route');
    repository.update.mockResolvedValue({ id: 'bu-cmc', name: 'CMC行业一部', enabled: true });
    repository.restoreDefaults.mockResolvedValue(await repository.list());

    const patchResponse = await patchRoute.PATCH(
      new Request('http://localhost/api/admin/organization-config/bu-cmc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CMC行业一部' }),
      }),
      { params: Promise.resolve({ id: 'bu-cmc' }) },
    );
    const restoreResponse = await collectionRoute.POST(new Request(
      'http://localhost/api/admin/organization-config',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore_defaults' }),
      },
    ));

    expect(patchResponse.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith('bu-cmc', {
      name: 'CMC行业一部',
      parentId: undefined,
      enabled: undefined,
      sortOrder: undefined,
    });
    expect(restoreResponse.status).toBe(200);
    expect(repository.restoreDefaults).toHaveBeenCalledOnce();
  });
});
