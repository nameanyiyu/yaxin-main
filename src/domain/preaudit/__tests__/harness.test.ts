import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('preaudit test harness', () => {
  it('loads the configured path alias', async () => {
    const configModule = await import('@/config');
    expect(configModule.APP_CONFIG.name).toContain('亚信科技');
  });

  it('uses the stable webpack bundler for local development', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: { dev: string } };

    expect(packageJson.scripts.dev).toBe('next dev --webpack');
  });
});
