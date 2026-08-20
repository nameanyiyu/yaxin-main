export type CanonicalCustomerRating = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface CustomerRatingResolution {
  input: string;
  canonical?: CanonicalCustomerRating;
  recognized: boolean;
  blacklisted: boolean;
  source: 'local-rule' | 'external-pending';
}

const STANDARD_RATING = /^(?:客户)?([SABCDE])(?:级)?(?:客户)?$/i;
const BLACKLIST_RATING = /(黑名单|BLACKLIST|BLACK)/i;

export function resolveCustomerRating(value: unknown): CustomerRatingResolution {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return {
      input: '',
      recognized: false,
      blacklisted: false,
      source: 'external-pending',
    };
  }

  const compact = input.replace(/[\s_-]+/g, '');
  if (BLACKLIST_RATING.test(compact)) {
    return {
      input,
      canonical: 'E',
      recognized: true,
      blacklisted: true,
      source: 'local-rule',
    };
  }

  const match = compact.match(STANDARD_RATING);
  if (match?.[1]) {
    return {
      input,
      canonical: match[1].toUpperCase() as CanonicalCustomerRating,
      recognized: true,
      blacklisted: match[1].toUpperCase() === 'E',
      source: 'local-rule',
    };
  }

  return {
    input,
    recognized: false,
    blacklisted: false,
    source: 'external-pending',
  };
}
