import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { exportTrackingWorkbook } from '../tracking-workbook';
import type { PreauditProject } from '../types';

const templatePath = path.resolve('data', 'templates', 'project-tracking-2026.xlsx');

function trackedProject(status: 'tracking' | 'tracking_completed' = 'tracking'): PreauditProject {
  return {
    id: 'project-approved',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status,
    answers: {
      contractName: { value: '安徽广电项目', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      customerName: { value: '安徽广电集团', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      salesBu: { value: '审批资料BU', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      salesRegion: { value: '审批资料区域', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      contractAmountCny: { value: 21000000, source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      gm1: { value: 12.5, source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      hasProcurement: { value: false, source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
    },
    messages: [],
    risks: [],
    narratives: {},
    externalApproval: {
      decision: 'approved',
      decisionDate: '2026-07-29',
      specialApprovalItems: '批准低毛利特批，按月跟踪回款',
      recordedBy: '管理员',
      recordedAt: '2026-07-29T00:00:00.000Z',
      history: [],
    },
    tracking: {
      status: status === 'tracking' ? 'in_progress' : 'completed',
      currentSnapshotId: 'snapshot-latest',
      snapshots: [
        {
          id: 'snapshot-old',
          effectiveDate: '2026-07-20',
          source: 'manual',
          values: { projectLatestProgress: '旧进度' },
          contentFingerprint: 'old',
          createdBy: '管理员',
          createdAt: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'snapshot-latest',
          effectiveDate: '2026-07-29',
          source: 'manual',
          values: {
            salesBu: '政企BU',
            salesRegion: '华东区',
            salesManager: '张三',
            projectName: '安徽广电项目',
            customerName: '安徽广电集团',
            contractAmountCny: 20000000,
            approvedGm1: 12.5,
            currentForecastGm1: 10,
            profitCommitmentStatus: 'at_risk',
            commitmentProgress: '预计毛利下降',
            projectLatestProgress: '完成首验',
            procurementContract: '不应导出的旧采购数据',
          },
          contentFingerprint: 'latest',
          createdBy: '管理员',
          createdAt: '2026-07-29T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    },
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function rejectedProject(): PreauditProject {
  const project = trackedProject();
  return {
    ...project,
    id: 'project-rejected',
    status: 'rejected',
    tracking: undefined,
    externalApproval: {
      decision: 'rejected',
      decisionDate: '2026-07-29',
      comments: '客户资信未通过',
      recordedBy: '管理员',
      recordedAt: '2026-07-29T00:00:00.000Z',
      history: [],
    },
  };
}

describe('tracking workbook export', () => {
  it('preserves the workbook layout and exports latest approved and rejected data', async () => {
    const bytes = await exportTrackingWorkbook(
      [trackedProject(), rejectedProject()],
      { templatePath },
    );
    const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, cellDates: true });

    expect(workbook.SheetNames).toEqual([
      'Sheet1',
      '填表说明',
      '项目预警风险汇总',
      'OT前置特批跟踪合同',
      '历史通用审批特批合同',
      'EMT前置特批拒绝合同',
      '商务部-采购明细',
    ]);
    const main = workbook.Sheets['OT前置特批跟踪合同'];
    expect(main.B1.v).toBe('基本信息');
    expect(main.H3.v).toBe('安徽广电项目');
    expect(main.E3.v).toBe('审批资料BU');
    expect(main.F3.v).toBe('审批资料区域');
    expect(main.K3.v).toBe('批准低毛利特批，按月跟踪回款');
    expect(main.P3.v).toBe(21000000);
    expect(main.AG3).toBeUndefined();
    expect(main.AM3.v).toBe('完成首验');
    expect(main.AL3.v).toContain('当前预测GM1：10%');
    expect(main.AL3.v).toContain('利润承诺：存在风险');
    expect(main.AN3.v).toBe('project-approved');
    expect(main['!cols']?.[39]?.hidden).toBe(true);
    expect(main['!merges']?.length).toBeGreaterThan(0);
    const archive = unzipSync(new Uint8Array(bytes));
    const mainSheetXml = strFromU8(archive['xl/worksheets/sheet4.xml']);
    expect(mainSheetXml).not.toMatch(/<col\b[^>]*\blevel="/);

    const rejected = workbook.Sheets['EMT前置特批拒绝合同'];
    expect(rejected.C3.v).toBe('安徽广电项目');
    expect(rejected.G3.v).toBe('客户资信未通过');
  });
});
