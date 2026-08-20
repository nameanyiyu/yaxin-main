import { describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({
  networkInterfaces: () => ({
    en0: [
      {
        address: '10.20.30.40',
        family: 'IPv4',
        internal: false,
        netmask: '255.255.255.0',
        cidr: '10.20.30.40/24',
        mac: '00:00:00:00:00:00',
      },
    ],
    lo0: [
      {
        address: '127.0.0.1',
        family: 'IPv4',
        internal: true,
        netmask: '255.0.0.0',
        cidr: '127.0.0.1/8',
        mac: '00:00:00:00:00:00',
      },
    ],
  }),
}));

describe('Next.js development origins', () => {
  it('allows the current non-internal IPv4 address', async () => {
    const { default: nextConfig } = await import('../../../../next.config');

    expect(nextConfig.allowedDevOrigins).toContain('10.20.30.40');
  });
});
