import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PREAUDIT_TEMPLATE_2025_11 } from '../template-2025-11';
import { FileTemplateRegistry } from '../template-registry';

const tempDirectories: string[] = [];

async function registryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'preaudit-templates-'));
  tempDirectories.push(root);
  const stateDirectory = path.join(root, 'state');
  const templateDirectory = path.join(root, 'templates');
  await mkdir(templateDirectory, { recursive: true });
  await writeFile(path.join(templateDirectory, PREAUDIT_TEMPLATE_2025_11.fileName), 'fixed-template');
  const registry = new FileTemplateRegistry(stateDirectory, templateDirectory, {
    idFactory: () => 'custom-id',
    now: () => '2026-07-27T00:00:00.000Z',
  });
  await registry.initialize();
  return registry;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('FileTemplateRegistry', () => {
  it('keeps the built-in template and supports custom template CRUD', async () => {
    const registry = await registryFixture();
    expect(await registry.list()).toEqual([
      expect.objectContaining({ id: PREAUDIT_TEMPLATE_2025_11.id, builtin: true }),
    ]);

    const created = await registry.create({
      name: '政企项目审批表',
      version: '2026-01',
      token: 'government-2026',
    });
    expect(created).toMatchObject({
      id: 'custom-id',
      token: 'government-2026',
      builtin: false,
    });
    expect((await registry.getByToken('government-2026'))?.fields).toHaveLength(
      PREAUDIT_TEMPLATE_2025_11.fields.length,
    );

    const updated = await registry.update(created.id, {
      name: '政企项目审批表（修订）',
      version: '2026-02',
    });
    expect(updated).toMatchObject({ name: '政企项目审批表（修订）', version: '2026-02' });
    expect(await registry.delete(created.id)).toBe(true);
    expect(await registry.get(created.id)).toBeUndefined();
  });

  it('rejects duplicate tokens and deletion of the built-in template', async () => {
    const registry = await registryFixture();
    await expect(registry.create({
      name: '重复模板',
      version: '1',
      token: PREAUDIT_TEMPLATE_2025_11.token,
    })).rejects.toMatchObject({ code: 'TEMPLATE_TOKEN_EXISTS' });
    await expect(registry.delete(PREAUDIT_TEMPLATE_2025_11.id)).rejects.toMatchObject({
      code: 'BUILTIN_TEMPLATE_IMMUTABLE',
    });
  });
});
