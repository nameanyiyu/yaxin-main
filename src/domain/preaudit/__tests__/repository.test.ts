import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilePreauditRepository } from '../repository';
import type { PreauditProject } from '../types';

const tempDirectories: string[] = [];

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-repository-'));
  tempDirectories.push(directory);
  return directory;
}

function sampleProject(id = 'project-1'): PreauditProject {
  const now = '2026-07-22T00:00:00.000Z';
  return {
    id,
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '测试销售',
    status: 'interviewing',
    answers: {},
    messages: [],
    risks: [],
    narratives: {},
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('FilePreauditRepository', () => {
  it('initializes empty state and persists projects across instances', async () => {
    const directory = await makeTempDirectory();
    const repo = new FilePreauditRepository(directory);
    await repo.initialize();
    expect(await repo.listProjects()).toEqual([]);

    const project = sampleProject();
    await repo.saveProject(project);

    const reloaded = new FilePreauditRepository(directory);
    await reloaded.initialize();
    expect(await reloaded.getProject(project.id)).toEqual(project);
  });

  it('updates an existing project and supports filters', async () => {
    const directory = await makeTempDirectory();
    const repo = new FilePreauditRepository(directory);
    await repo.initialize();
    await repo.saveProject(sampleProject('first'));
    await repo.saveProject({ ...sampleProject('second'), token: 'another-token', status: 'pending_review' });
    await repo.saveProject({ ...sampleProject('first'), status: 'preaudit_needs_input' });

    expect((await repo.getProject('first'))?.status).toBe('preaudit_needs_input');
    expect(await repo.listProjects({ token: 'preaudit202511' })).toHaveLength(1);
    expect(await repo.listProjects({ status: 'pending_review' })).toHaveLength(1);
    expect(await repo.findActiveProject('preaudit202511', '测试销售')).toMatchObject({ id: 'first' });
  });

  it('serializes concurrent writes without dropping projects', async () => {
    const directory = await makeTempDirectory();
    const repo = new FilePreauditRepository(directory);
    await repo.initialize();

    await Promise.all(Array.from({ length: 10 }, (_, index) => repo.saveProject(sampleProject(`project-${index}`))));
    expect(await repo.listProjects()).toHaveLength(10);
  });

  it('finds the latest active project for the requested opportunity serial number', async () => {
    const directory = await makeTempDirectory();
    const repo = new FilePreauditRepository(directory);
    await repo.initialize();
    await repo.saveProject({ ...sampleProject('opp-1'), answers: { opportunitySerialNumber: { value: 'OPP-1', source: 'sales', updatedAt: '2026-07-22T00:00:00.000Z' } } });
    await repo.saveProject({ ...sampleProject('opp-2'), updatedAt: '2026-07-23T00:00:00.000Z', answers: { opportunitySerialNumber: { value: 'OPP-2', source: 'sales', updatedAt: '2026-07-23T00:00:00.000Z' } } });

    expect(await repo.findActiveProject('preaudit202511', '测试销售', 'OPP-1')).toMatchObject({ id: 'opp-1' });
    expect(await repo.findActiveProject('preaudit202511', '测试销售')).toMatchObject({ id: 'opp-2' });
  });

  it('deletes a project and persists the deletion', async () => {
    const directory = await makeTempDirectory();
    const repo = new FilePreauditRepository(directory);
    await repo.initialize();
    await repo.saveProject(sampleProject('delete-me'));

    expect(await repo.deleteProject('delete-me')).toBe(true);
    expect(await repo.deleteProject('delete-me')).toBe(false);

    const reloaded = new FilePreauditRepository(directory);
    await reloaded.initialize();
    expect(await reloaded.getProject('delete-me')).toBeUndefined();
  });

  it('refuses to overwrite malformed JSON', async () => {
    const directory = await makeTempDirectory();
    const stateFile = path.join(directory, 'projects.json');
    await writeFile(stateFile, '{ malformed', 'utf8');

    const repo = new FilePreauditRepository(directory);
    await expect(repo.initialize()).rejects.toThrow('PREAUDIT_STATE_INVALID');
    expect(await readFile(stateFile, 'utf8')).toBe('{ malformed');
  });
});
