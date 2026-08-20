import type { PreauditProject } from '@/domain/preaudit/types';

export type ApprovalSubmissionResult =
  | { success: true; externalReference: string }
  | { success: false; code: string; message: string };

export interface ApprovalAdapter {
  submit(project: PreauditProject): Promise<ApprovalSubmissionResult>;
}

export async function submitToApproval(
  adapter: ApprovalAdapter | undefined,
  project: PreauditProject,
): Promise<ApprovalSubmissionResult> {
  if (!adapter) {
    return {
      success: false,
      code: 'APPROVAL_NOT_CONFIGURED',
      message: '审批接口暂未接入，请人工提交。',
    };
  }
  return adapter.submit(project);
}
