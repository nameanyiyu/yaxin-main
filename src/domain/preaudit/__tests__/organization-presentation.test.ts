import { describe, expect, it } from 'vitest';
import { defaultOrganizationConfig } from '../organization-config';
import { organizationTree } from '@/components/admin/OrganizationConfigPanel';

describe('organization config presentation', () => {
  it('groups enabled and disabled children under their configured parent', () => {
    const nodes = defaultOrganizationConfig('2026-07-30T00:00:00.000Z');
    const tsg = nodes.find((node) => node.type === 'bg' && node.name === 'TSG')!;
    const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC')!;
    nodes.push({
      id: 'region-east',
      type: 'region',
      name: '华东区',
      parentId: cmc.id,
      enabled: false,
      sortOrder: 0,
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    });

    const tree = organizationTree(nodes);

    expect(tree.find((item) => item.id === tsg.id)?.children[0]).toMatchObject({
      name: 'CMC',
      enabled: true,
      children: [expect.objectContaining({ name: '华东区', enabled: false })],
    });
  });

  it('sorts every level by configured order', () => {
    const nodes = defaultOrganizationConfig('2026-07-30T00:00:00.000Z');
    const dig = nodes.find((node) => node.type === 'bg' && node.name === 'DIG')!;
    dig.sortOrder = -1;

    expect(organizationTree(nodes)[0].name).toBe('DIG');
  });
});
