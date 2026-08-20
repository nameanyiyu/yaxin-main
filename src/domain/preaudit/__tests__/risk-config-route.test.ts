import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PUT } from '@/app/api/admin/risk-config/route';
import { defaultRiskConfiguration } from '../risk-config';

const tempDirectories: string[] = [];
const originalDataDirectory = process.env.PREAUDIT_DATA_DIR;

afterEach(async () => {
  if (originalDataDirectory === undefined) delete process.env.PREAUDIT_DATA_DIR;
  else process.env.PREAUDIT_DATA_DIR = originalDataDirectory;
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('risk configuration route', () => {
  it('returns the saved configuration instead of serializing a pending promise', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-risk-config-route-'));
    tempDirectories.push(directory);
    process.env.PREAUDIT_DATA_DIR = directory;
    const config = defaultRiskConfiguration('2026-08-17T00:00:00.000Z');

    const response = await PUT(new Request('http://localhost/api/admin/risk-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }));
    const saved = await response.json() as { rules?: unknown[]; updatedAt?: string };

    expect(response.status).toBe(200);
    expect(saved.rules).toHaveLength(config.rules.length);
    expect(saved.updatedAt).toBeTruthy();
  });
});
