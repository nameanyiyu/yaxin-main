import type {
  ApprovalDecision,
  ExternalApprovalDecision,
  PreauditProject,
  ProjectTrackingLedger,
} from './types';

export class ExternalApprovalError extends Error {
  readonly code = 'INVALID_EXTERNAL_APPROVAL';

  constructor(message: string) {
    super(message);
    this.name = 'ExternalApprovalError';
  }
}

export interface RecordExternalApprovalInput {
  decision: ApprovalDecision;
  decisionDate: string;
  externalReference?: string;
  comments?: string;
  specialApprovalItems?: string;
  conditionalReason?: string;
  conditions?: string;
  recordedBy: string;
}

export interface VerifyAdmissionConditionInput {
  result: 'fulfilled' | 'failed';
  comments: string;
  verifiedBy: string;
}

export interface ExternalApprovalAdapter {
  getDecision(project: PreauditProject): Promise<ExternalApprovalDecision | null>;
}

export class LocalExternalApprovalAdapter implements ExternalApprovalAdapter {
  async getDecision(): Promise<null> {
    return null;
  }
}

function required(value: string | undefined, message: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new ExternalApprovalError(message);
  return normalized;
}

export function createEmptyTrackingLedger(now: string): ProjectTrackingLedger {
  return {
    status: 'not_started',
    snapshots: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildExternalApproval(
  input: RecordExternalApprovalInput,
  now: string,
  eventId: string,
): ExternalApprovalDecision {
  const recordedBy = required(input.recordedBy, '请填写审批结果记录人');
  const decisionDate = required(input.decisionDate, '请填写审批日期');
  const comments = input.comments?.trim() || undefined;
  const specialApprovalItems = input.specialApprovalItems?.trim() || undefined;
  const conditionalReason = input.conditionalReason?.trim() || undefined;
  const conditions = input.conditions?.trim() || undefined;

  if (input.decision === 'rejected' && !comments) {
    throw new ExternalApprovalError('被驳回时必须填写驳回原因');
  }
  if (input.decision !== 'rejected' && !specialApprovalItems) {
    throw new ExternalApprovalError('已完成审批或有条件准入时必须填写特批事项');
  }
  if (input.decision === 'conditional' && (!conditionalReason || !conditions)) {
    throw new ExternalApprovalError('有条件准入时必须填写准入原因和准入条件');
  }

  return {
    decision: input.decision,
    decisionDate,
    externalReference: input.externalReference?.trim() || undefined,
    comments,
    specialApprovalItems,
    conditionalReason,
    conditions,
    verification: input.decision === 'conditional' ? { result: 'pending' } : undefined,
    recordedBy,
    recordedAt: now,
    history: [{
      id: eventId,
      action: 'recorded',
      decision: input.decision,
      operator: recordedBy,
      comments,
      specialApprovalItems,
      at: now,
    }],
  };
}

export function verifyConditionalApproval(
  approval: ExternalApprovalDecision,
  input: VerifyAdmissionConditionInput,
  now: string,
  eventId: string,
): ExternalApprovalDecision {
  if (approval.decision !== 'conditional' || approval.verification?.result !== 'pending') {
    throw new ExternalApprovalError('当前项目没有待核验的准入条件');
  }
  const verifiedBy = required(input.verifiedBy, '请填写条件核验人');
  const comments = required(input.comments, '请填写条件核验说明');
  const fulfilled = input.result === 'fulfilled';
  const decision: ApprovalDecision = fulfilled ? 'approved' : 'rejected';

  return {
    ...approval,
    decision,
    comments: fulfilled ? approval.comments : comments,
    verification: {
      result: input.result,
      comments,
      verifiedBy,
      verifiedAt: now,
    },
    history: [
      ...approval.history,
      {
        id: eventId,
        action: fulfilled ? 'condition_fulfilled' : 'condition_failed',
        decision,
        operator: verifiedBy,
        comments,
        at: now,
      },
    ],
  };
}
