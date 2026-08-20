import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseTrackingWorkbook } from '../tracking-workbook';
import type { PreauditProject } from '../types';

const templatePath = path.resolve('data', 'templates', 'project-tracking-2026.xlsx');

function project(id: string, overrides: Partial<PreauditProject> = {}): PreauditProject {
  return {
    id,
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status: 'tracking',
    answers: {
      contractName: { value: '安徽广电项目', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      customerName: { value: '安徽广电集团', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      salesManager: { value: '张三', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      opportunitySerialNumber: { value: 'SJ-001', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
    },
    messages: [],
    risks: [],
    narratives: {},
    tracking: {
      status: 'in_progress',
      currentSnapshotId: 'snapshot-1',
      snapshots: [{
        id: 'snapshot-1',
        effectiveDate: '2026-07-20',
        source: 'manual',
        values: { currentIssues: '旧问题' },
        contentFingerprint: 'old',
        createdBy: '管理员',
        createdAt: '2026-07-20T00:00:00.000Z',
      }],
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

async function workbookWithRow(values: Record<string, string | number>) {
  const source = await readFile(templatePath);
  const workbook = XLSX.read(source, { type: 'buffer', cellStyles: true, cellDates: true });
  const sheet = workbook.Sheets['OT前置特批跟踪合同'];
  for (const address of Object.keys(sheet)) {
    if (/^[A-Z]+[3-9]\d*$/.test(address)) delete sheet[address];
  }
  for (const [column, value] of Object.entries(values)) {
    sheet[`${column}3`] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  }
  sheet['!ref'] = 'A1:AN3';
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
}

describe('tracking workbook import preview', () => {
  it('imports only snapshot-owned fields and prioritizes the hidden project id', async () => {
    const bytes = await workbookWithRow({
      B: '跟踪中',
      C: 46232,
      E: '政企BU',
      F: '华东区',
      G: '张三',
      H: '安徽广电项目',
      I: '安徽广电集团',
      N: '#CLEAR',
      Q: 0.125,
      T: 'wrong-code',
      V: 120000,
      AL: '利润存在风险',
      AM: '客户已完成首验',
      AN: 'project-1',
    });

    const preview = parseTrackingWorkbook(bytes, [
      project('project-1'),
      project('project-2', {
        answers: {
          projectCode: { value: 'wrong-code', source: 'reviewer', updatedAt: '2026-07-20T00:00:00.000Z' },
        },
      }),
    ]);

    expect(preview.summary).toMatchObject({ matched: 1, invalid: 0, ambiguous: 0, unmatched: 0 });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 3,
      matchStatus: 'matched',
      projectId: 'project-1',
      effectiveDate: '2026-07-29',
      values: {
        currentIssues: '#CLEAR',
        cumulativeCollection: 120000,
        commitmentProgress: '利润存在风险',
        projectLatestProgress: '客户已完成首验',
      },
    });
    expect(preview.rows[0].values).not.toHaveProperty('salesBu');
    expect(preview.rows[0].values).not.toHaveProperty('approvedGm1');
  });

  it('falls back to opportunity number and exact normalized composite matching', async () => {
    const byOpportunity = await workbookWithRow({
      C: 46232,
      G: '其他销售',
      H: '其他项目',
      I: '其他客户',
      T: 'SJ-001',
    });
    expect(parseTrackingWorkbook(byOpportunity, [project('project-1')]).rows[0].projectId).toBe('project-1');

    const byComposite = await workbookWithRow({
      C: 46232,
      G: ' 张三 ',
      H: '安徽广电　项目',
      I: '安徽广电集团',
    });
    expect(parseTrackingWorkbook(byComposite, [project('project-1')]).rows[0].projectId).toBe('project-1');
  });

  it('reports ambiguous, unmatched, invalid, and stale rows without writing', async () => {
    const ambiguousBytes = await workbookWithRow({
      C: 46232,
      G: '张三',
      H: '安徽广电项目',
      I: '安徽广电集团',
    });
    const ambiguous = parseTrackingWorkbook(ambiguousBytes, [project('one'), project('two')]);
    expect(ambiguous.rows[0].matchStatus).toBe('ambiguous');

    const unmatchedBytes = await workbookWithRow({
      C: 46232,
      G: '无人',
      H: '不存在项目',
      I: '不存在客户',
    });
    expect(parseTrackingWorkbook(unmatchedBytes, [project('one')]).rows[0].matchStatus).toBe('unmatched');

    const invalidBytes = await workbookWithRow({
      C: '不是日期',
      G: '张三',
      H: '安徽广电项目',
      I: '安徽广电集团',
      Q: 2,
    });
    const invalid = parseTrackingWorkbook(invalidBytes, [project('one')]);
    expect(invalid.rows[0]).toMatchObject({ matchStatus: 'invalid' });
    expect(invalid.rows[0].errors.join(' ')).toContain('更新时间');

    const staleProject = project('one');
    if (staleProject.tracking) staleProject.tracking.snapshots[0].effectiveDate = '2026-08-01';
    const staleBytes = await workbookWithRow({
      C: 46232,
      G: '张三',
      H: '安徽广电项目',
      I: '安徽广电集团',
    });
    expect(parseTrackingWorkbook(staleBytes, [staleProject]).rows[0].matchStatus).toBe('stale');
  });

  it('rejects supplier tracking input when approval data does not involve procurement', async () => {
    const bytes = await workbookWithRow({
      C: 46232,
      G: '张三',
      H: '安徽广电项目',
      I: '安徽广电集团',
      AG: '供应商合同已签署',
      AN: 'project-1',
    });

    const preview = parseTrackingWorkbook(bytes, [project('project-1', {
      answers: {
        contractName: { value: '安徽广电项目', source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
        hasProcurement: { value: false, source: 'reviewer', updatedAt: '2026-07-29T00:00:00.000Z' },
      },
    })]);

    expect(preview.rows[0].matchStatus).toBe('invalid');
    expect(preview.rows[0].errors.join(' ')).toContain('不涉及采购');
  });
});
