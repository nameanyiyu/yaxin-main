import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/admin/settings/route';

describe('admin settings route', () => {
  it('does not allow runtime provider or credential changes', async () => {
    const response = await POST();
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ENVIRONMENT_SETTINGS_ONLY' },
    });
  });
});
