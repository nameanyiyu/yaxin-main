import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../state-machine';

describe('preaudit status transitions', () => {
  it('allows the approved workflow edges', () => {
    expect(canTransition('interviewing', 'pending_review')).toBe(true);
    expect(canTransition('pending_review', 'reviewed')).toBe(true);
    expect(canTransition('reviewed', 'pending_manual_submission')).toBe(true);
    expect(canTransition('pending_manual_submission', 'pending_external_decision')).toBe(true);
    expect(canTransition('pending_external_decision', 'tracking')).toBe(true);
    expect(canTransition('pending_external_decision', 'conditional_admission')).toBe(true);
    expect(canTransition('pending_external_decision', 'rejected')).toBe(true);
    expect(canTransition('conditional_admission', 'tracking')).toBe(true);
    expect(canTransition('conditional_admission', 'rejected')).toBe(true);
    expect(canTransition('tracking', 'tracking_completed')).toBe(true);
  });

  it('rejects skipping review', () => {
    expect(canTransition('interviewing', 'pending_manual_submission')).toBe(false);
    expect(() => assertTransition('interviewing', 'pending_manual_submission')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_STATUS_TRANSITION' }),
    );
  });
});
