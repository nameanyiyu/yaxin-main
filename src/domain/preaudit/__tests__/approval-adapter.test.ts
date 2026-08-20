import { describe, expect, it } from 'vitest';
import { submitToApproval } from '@/lib/feishu';
import type { PreauditProject } from '../types';

const sampleProject: PreauditProject = {
  id: 'project-approval-test',
  templateVersion: '2025-11',
  token: 'preaudit202511',
  salesName: '测试销售',
  status: 'pending_manual_submission',
  answers: {},
  messages: [],
  risks: [],
  narratives: {},
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('approval adapter', () => {
  it('does not fabricate approval success without an adapter', async () => {
    const result = await submitToApproval(undefined, sampleProject);
    expect(result).toEqual({
      success: false,
      code: 'APPROVAL_NOT_CONFIGURED',
      message: '审批接口暂未接入，请人工提交。',
    });
  });
});
