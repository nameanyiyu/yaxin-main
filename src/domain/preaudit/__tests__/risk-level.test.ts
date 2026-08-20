import { describe, expect, it } from 'vitest';
import {
  isAbsoluteControlRisk,
  riskControlLevel,
  riskControlLevelLabel,
} from '../risk-level';

describe('risk control level labels', () => {
  it('uses the configured control level ahead of legacy severity', () => {
    const finding = { severity: 'blocking' as const, controlLevel: 'approval' as const };

    expect(riskControlLevel(finding)).toBe('approval');
    expect(riskControlLevelLabel(finding)).toBe('审批准入');
    expect(isAbsoluteControlRisk(finding)).toBe(false);
  });

  it.each([
    ['blocking', '绝对禁止'],
    ['high', '原则禁止'],
    ['medium', '审批准入'],
  ] as const)('maps legacy %s severity to %s when control level is absent', (severity, label) => {
    expect(riskControlLevelLabel({ severity })).toBe(label);
  });
});
