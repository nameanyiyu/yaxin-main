import { describe, expect, it } from 'vitest';
import { formatAnalyticsRatio, warningLabel } from '@/components/admin/AnalyticsPanel';

describe('analytics presentation', () => {
  it('formats null ratios as a dash and retains numeric precision', () => {
    expect(formatAnalyticsRatio(null)).toBe('—');
    expect(formatAnalyticsRatio(37.5)).toBe('37.5%');
    expect(formatAnalyticsRatio(100)).toBe('100%');
  });

  it('uses clear Chinese labels for warning rules', () => {
    expect(warningLabel('COLLECTION_REACHED_CONTRACT')).toBe('建议结束跟踪');
    expect(warningLabel('FORECAST_GM1_BELOW_APPROVED')).toBe('预测利润低于审批');
  });
});
