import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultOrganizationConfig,
  enabledBus,
  FileOrganizationConfigRepository,
  resolveOrganization,
} from '../organization-config';

async function repositoryFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'preaudit-organization-'));
  const repository = new FileOrganizationConfigRepository(directory, () => '2026-07-30T00:00:00.000Z');
  await repository.initialize();
  return { directory, repository };
}

describe('organization config', () => {
  it('ships the approved BG and BU hierarchy', () => {
    const config = defaultOrganizationConfig('2026-07-30T00:00:00.000Z');

    expect(enabledBus(config, 'TSG').map((item) => item.name)).toEqual(['CMC', 'CUC', 'CTC', 'AIO']);
    expect(enabledBus(config, 'DIG').map((item) => item.name)).toEqual(['SIO', 'AID', 'AIS']);
    expect(enabledBus(config, 'SIG').map((item) => item.name)).toEqual(['ESU', 'SSU']);
    expect(enabledBus(config, 'CSU').map((item) => item.name)).toEqual(['CSU']);
    expect(resolveOrganization(config, 'AIS')?.bg.name).toBe('DIG');
  });

  it('initializes and persists the default hierarchy', async () => {
    const { directory, repository } = await repositoryFixture();

    expect((await repository.list()).filter((node) => node.type === 'bg')).toHaveLength(4);
    const persisted = JSON.parse(
      await readFile(path.join(directory, 'organization-config.json'), 'utf8'),
    ) as unknown[];
    expect(persisted.length).toBeGreaterThan(4);
  });

  it('creates a region and resolves its complete hierarchy', async () => {
    const { repository } = await repositoryFixture();
    const nodes = await repository.list();
    const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC');
    expect(cmc).toBeDefined();

    const region = await repository.create({
      type: 'region',
      name: '华东区',
      parentId: cmc!.id,
    });
    const resolved = resolveOrganization(await repository.list(), 'CMC', '华东区');

    expect(region).toMatchObject({ enabled: true, sortOrder: 0 });
    expect(resolved).toMatchObject({
      bg: { name: 'TSG' },
      bu: { name: 'CMC' },
      region: { name: '华东区' },
    });
  });

  it('rejects duplicate sibling names', async () => {
    const { repository } = await repositoryFixture();
    const tsg = (await repository.list()).find((node) => node.type === 'bg' && node.name === 'TSG');

    await expect(repository.create({ type: 'bu', name: ' CMC ', parentId: tsg!.id }))
      .rejects.toMatchObject({
        code: 'ORGANIZATION_CONFIG_INVALID',
      });
  });

  it('prevents enabled children below a disabled parent', async () => {
    const { repository } = await repositoryFixture();
    const nodes = await repository.list();
    const tsg = nodes.find((node) => node.type === 'bg' && node.name === 'TSG')!;
    const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC')!;

    await repository.update(tsg.id, { enabled: false });

    await expect(repository.create({ type: 'region', name: '华北区', parentId: cmc.id }))
      .rejects.toMatchObject({
        code: 'ORGANIZATION_CONFIG_INVALID',
      });
  });

  it('updates names, sort order and parent while preserving stable ids', async () => {
    const { repository } = await repositoryFixture();
    const nodes = await repository.list();
    const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC')!;
    const cuc = nodes.find((node) => node.type === 'bu' && node.name === 'CUC')!;
    const region = await repository.create({ type: 'region', name: '华东区', parentId: cmc.id });

    const updated = await repository.update(region.id, {
      name: '东部区',
      parentId: cuc.id,
      sortOrder: 8,
    });

    expect(updated).toMatchObject({
      id: region.id,
      name: '东部区',
      parentId: cuc.id,
      sortOrder: 8,
    });
  });
});
