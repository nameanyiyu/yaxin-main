import type { ProjectStatus } from './types';

const transitions: Record<ProjectStatus, ProjectStatus[]> = {
  interviewing: ['preaudit_needs_input', 'pending_review'],
  preaudit_needs_input: ['interviewing', 'pending_review'],
  pending_review: ['interviewing', 'reviewed'],
  reviewed: ['pending_manual_submission'],
  pending_manual_submission: ['pending_external_decision', 'archived'],
  pending_external_decision: ['conditional_admission', 'tracking', 'rejected'],
  conditional_admission: ['tracking', 'rejected'],
  tracking: ['tracking_completed'],
  rejected: [],
  tracking_completed: [],
  archived: [],
};

export class StatusTransitionError extends Error {
  readonly code = 'ILLEGAL_STATUS_TRANSITION';

  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`不允许项目状态从 ${from} 变更为 ${to}`);
    this.name = 'StatusTransitionError';
  }
}

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new StatusTransitionError(from, to);
}
