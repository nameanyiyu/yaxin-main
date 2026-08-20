import type { RiskFinding } from './types';

export type RiskControlLevel = NonNullable<RiskFinding['controlLevel']>;

const CONTROL_LEVEL_LABELS: Record<RiskControlLevel, string> = {
  absolute: '绝对禁止',
  principle: '原则禁止',
  approval: '审批准入',
};

export function riskControlLevel(
  finding: Pick<RiskFinding, 'controlLevel' | 'severity'>,
): RiskControlLevel {
  if (finding.controlLevel) return finding.controlLevel;
  if (finding.severity === 'blocking') return 'absolute';
  if (finding.severity === 'high') return 'principle';
  return 'approval';
}

export function riskControlLevelLabel(
  finding: Pick<RiskFinding, 'controlLevel' | 'severity'>,
): string {
  return CONTROL_LEVEL_LABELS[riskControlLevel(finding)];
}

export function isAbsoluteControlRisk(
  finding: Pick<RiskFinding, 'controlLevel' | 'severity'>,
): boolean {
  return riskControlLevel(finding) === 'absolute';
}
