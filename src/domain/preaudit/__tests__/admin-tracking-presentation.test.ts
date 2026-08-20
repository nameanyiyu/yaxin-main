import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROJECT_STATUS_LABELS } from '../presentation';
import { TRACKING_FIELDS } from '../tracking-fields';
import { projectAction } from '../../../lib/admin-workbench';
import type { PreauditProject, ProjectStatus } from '../types';

function project(status: ProjectStatus): PreauditProject {
  return {
    id: 'project-1',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status,
    answers: {},
    messages: [],
    risks: [],
    narratives: {},
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

describe('admin tracking presentation', () => {
  it('uses honest labels and next actions for every new workflow state', () => {
    expect(PROJECT_STATUS_LABELS).toMatchObject({
      pending_external_decision: '等待外部审批结果',
      conditional_admission: '有条件准入待核查',
      tracking: '项目跟踪中',
      rejected: '审批已驳回',
      tracking_completed: '跟踪已结束',
    });
    expect(projectAction(project('pending_external_decision')).label).toBe('登记外部审批结果');
    expect(projectAction(project('conditional_admission')).label).toBe('核查准入条件');
    expect(projectAction(project('tracking')).label).toBe('更新项目跟踪');
    expect(projectAction(project('rejected')).label).toBe('审批已驳回');
    expect(projectAction(project('tracking_completed')).label).toBe('跟踪已结束');
  });

  it('exposes the complete editable tracking field catalog', () => {
    expect(TRACKING_FIELDS.filter((field) => !field.systemControlled)).toHaveLength(37);
    expect(TRACKING_FIELDS.map((field) => field.label)).toEqual(expect.arrayContaining([
      '回款分析说明',
      '当前里程碑阶段',
      '采购合同付款节奏',
      '当前预测 GM1',
      '利润承诺是否达成',
      '项目最新进展',
    ]));
  });

  it('renders approval, tracking, import, and export controls in the admin workspace', () => {
    const approvalPanel = readFileSync(
      new URL('../../../components/admin/ExternalApprovalPanel.tsx', import.meta.url),
      'utf8',
    );
    const trackingPanel = readFileSync(
      new URL('../../../components/admin/ProjectTrackingPanel.tsx', import.meta.url),
      'utf8',
    );
    const ledgerPanel = readFileSync(
      new URL('../../../components/admin/TrackingLedgerPanel.tsx', import.meta.url),
      'utf8',
    );
    const adminPage = readFileSync(new URL('../../../app/admin/page.tsx', import.meta.url), 'utf8');

    expect(approvalPanel).toContain('外部审批结果');
    expect(approvalPanel).toContain('有条件准入');
    expect(trackingPanel).toContain('新增本期跟踪');
    expect(trackingPanel).toContain('历史跟踪记录');
    expect(ledgerPanel).toContain('批量导入 Excel');
    expect(ledgerPanel).toContain('导出当前台账');
    expect(ledgerPanel).toContain('导入预览明细');
    expect(ledgerPanel).toContain('row.changes');
    expect(adminPage).toContain("key: 'tracking'");
  });

  it('places tracking after risk conclusions and separates approval facts from editable snapshots', () => {
    const reviewPanel = readFileSync(
      new URL('../../../components/admin/ProjectReviewPanel.tsx', import.meta.url),
      'utf8',
    );
    const trackingPanel = readFileSync(
      new URL('../../../components/admin/ProjectTrackingPanel.tsx', import.meta.url),
      'utf8',
    );
    const riskPosition = reviewPanel.indexOf('aria-labelledby="risk-heading"');
    const trackingPosition = reviewPanel.indexOf('<ProjectTrackingPanel');
    const fieldsPosition = reviewPanel.indexOf('aria-labelledby="fields-heading"');

    expect(trackingPosition).toBeGreaterThan(riskPosition);
    expect(trackingPosition).toBeLessThan(fieldsPosition);
    expect(trackingPanel).toContain('来自审批资料');
    expect(trackingPanel).toContain('trackingDerivedValues');
    expect(trackingPanel).toContain('trackingFieldOwnership');
    expect(trackingPanel).toContain('isSupplierTrackingApplicable');
    expect(trackingPanel).not.toContain(
      'TRACKING_FIELDS.filter((field) => !field.systemControlled)',
    );
  });
});
