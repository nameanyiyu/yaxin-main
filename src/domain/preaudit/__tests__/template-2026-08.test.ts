import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOMER_LISTS, DEFAULT_RISK_RULES } from '../risk-config';
import { evaluateRisks } from '../risk-engine';
import { renderPreauditMarkdown } from '../markdown-adapter';
import { PREAUDIT_TEMPLATE_2026_08 } from '../template-2026-08';
import type { PreauditProject } from '../types';

describe('2026-08 Markdown template and BG rules', () => {
  it('contains the published template sections and seeded customer lists', () => {
    expect(PREAUDIT_TEMPLATE_2026_08.format).toBe('markdown');
    expect(PREAUDIT_TEMPLATE_2026_08.fields.some((field) => field.key === 'aisFinancingDecision')).toBe(true);
    expect(DEFAULT_RISK_RULES).toHaveLength(36);
    expect(DEFAULT_CUSTOMER_LISTS.filter((item) => item.type === 'blacklist')).toHaveLength(48);
    expect(DEFAULT_CUSTOMER_LISTS.filter((item) => item.type === 'whitelist')).toHaveLength(33);
  });

  it('applies the customer blacklist and DIG pure procurement rules', () => {
    const findings = evaluateRisks({
      salesBg: 'DIG', customerName: '北京国美大数据技术有限公司', customerRating: 'A', customerCollectionHealth: 1,
      isEmptyTurnoverContract: false, isFinancingTradeContract: false, hasNonMainBusiness: false,
      hasDirectFinancing: false, isPureProcurement: true, externalProcurementAmount: 2_500_000,
      chainLevel: 'direct', isBackToBackPayment: false, prepaymentPercent: 100, gm1: 10,
      hasProcurement: true, supplierHighRiskStatus: '低风险',
    }, { templateVersion: '2026-08' });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'COMPANY_CUSTOMER_BLACKLIST', triggered: true, severity: 'blocking' }),
      expect.objectContaining({ ruleId: 'DIG_SMALL_PURE_PROCUREMENT', triggered: true, severity: 'high' }),
    ]));
  });

  it('keeps AIS financing as an explicit manual-confirmation gap', () => {
    const findings = evaluateRisks({
      salesBg: 'DIG', customerName: '普通客户', customerRating: 'A', customerCollectionHealth: 1,
      isEmptyTurnoverContract: false, isFinancingTradeContract: false, hasNonMainBusiness: false,
      hasDirectFinancing: true, directFinancingAmount: 100_000, directFinancingMonths: 1,
      isAisBusiness: true, isPureProcurement: false, chainLevel: 'direct', isBackToBackPayment: false,
      prepaymentPercent: 100, gm1: 10,
    }, { templateVersion: '2026-08' });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'DIG_AIS_FINANCING', missingKeys: ['aisFinancingDecision'] }),
    ]));
  });

  it('renders a completed project as Markdown', () => {
    const project: PreauditProject = {
      id: 'project-1', templateVersion: '2026-08', token: 'preaudit202608', salesName: '张三', status: 'reviewed',
      answers: {
        salesBg: { value: 'DIG', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        salesBu: { value: 'SIO', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        contractName: { value: '测试项目', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        customerName: { value: '普通客户', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        customerRating: { value: 'A', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        customerCollectionHealth: { value: 1, source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        endUserName: { value: '最终用户', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        contractAmountCny: { value: 1000000, source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        gm1: { value: 10, source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        divisionCommitment: { value: '按期回款并保证交付', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        salesRegion: { value: '华东区', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        salesManager: { value: '张三', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
        opportunitySource: { value: '客户转介绍', source: 'sales', updatedAt: '2026-08-17T00:00:00.000Z' },
      },
      messages: [], risks: [], narratives: {}, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
    };
    const markdown = renderPreauditMarkdown(project);
    expect(markdown).toContain('## 一、特批项目基本情况');
    expect(markdown).toContain('测试项目');
    expect(markdown).toContain('客户转介绍');

    const feishuMarkdown = renderPreauditMarkdown(project, { documentTitle: '【测试项目】商机准入前置审批文档' });
    expect(feishuMarkdown.startsWith('# 【测试项目】商机准入前置审批文档')).toBe(true);
  });
});
