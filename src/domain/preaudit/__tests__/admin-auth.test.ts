import { describe, expect, it } from 'vitest';
import { isValidAdminAuthorization } from '@/lib/admin-auth';

describe('admin basic authentication', () => {
  it('accepts only the configured credentials', () => {
    const valid = `Basic ${Buffer.from('reviewer:secret').toString('base64')}`;
    const invalid = `Basic ${Buffer.from('reviewer:wrong').toString('base64')}`;
    expect(isValidAdminAuthorization(valid, 'reviewer', 'secret')).toBe(true);
    expect(isValidAdminAuthorization(invalid, 'reviewer', 'secret')).toBe(false);
    expect(isValidAdminAuthorization(null, 'reviewer', 'secret')).toBe(false);
  });
});
