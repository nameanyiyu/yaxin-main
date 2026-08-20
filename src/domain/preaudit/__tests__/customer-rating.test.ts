import { describe, expect, it } from 'vitest';
import { resolveCustomerRating } from '../customer-rating';

describe('customer rating resolution', () => {
  it.each([
    ['一级黑名单客户', 'E'],
    ['黑名单', 'E'],
    ['BLACKLIST', 'E'],
    ['A级客户', 'A'],
    [' b 级 ', 'B'],
  ])('normalizes %s to %s', (input, canonical) => {
    expect(resolveCustomerRating(input)).toMatchObject({
      canonical,
      recognized: true,
      source: 'local-rule',
    });
  });

  it('preserves unknown ratings for future external-system lookup', () => {
    expect(resolveCustomerRating('集团战略客户')).toEqual({
      input: '集团战略客户',
      recognized: false,
      blacklisted: false,
      source: 'external-pending',
    });
  });
});
