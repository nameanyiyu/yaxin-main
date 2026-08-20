import { describe, expect, it, afterEach } from 'vitest';
import { evaluateRisks } from '../risk-engine';
import { defaultRiskConfiguration, setRuntimeRiskConfiguration } from '../risk-config';

describe('evaluateRisks', () => {
  afterEach(() => {
    setRuntimeRiskConfiguration(defaultRiskConfiguration('2026-08-17T00:00:00.000Z'));
  });

  it.each([
    [{ customerRating: 'E' }, 'CUSTOMER_CREDIT', 'blocking'],
    [{ customerRating: '一级黑名单客户' }, 'CUSTOMER_CREDIT', 'blocking'],
    [{ customerCollectionHealth: 5 }, 'CUSTOMER_CREDIT', 'blocking'],
    [{ customerRating: 'D', prepaymentPercent: 99 }, 'CUSTOMER_CREDIT', 'high'],
    [{ chainLevel: 'second_subcontractor', upstreamSigned: true, fundingPartyConfirmed: true }, 'CONTRACT_CHAIN', 'high'],
    [{ gm1: 5 }, 'PROJECT_MARGIN', 'blocking'],
    [{ gm1: 15, hasChannelFee: true }, 'PROJECT_MARGIN', 'high'],
    [{ hasProcurement: true, externalProcurementPercent: 85, thirdPartyCoreDelivery: false }, 'PURE_PROCUREMENT', 'high'],
    [{ hasProcurement: true, externalProcurementPercent: 50, thirdPartyCoreDelivery: true }, 'PURE_PROCUREMENT', 'high'],
    [{ hasProcurement: true, supplierEntityType: 'individual' }, 'SUPPLIER_CREDIT', 'blocking'],
    [{ hasProcurement: true, allowsUnauthorizedSubcontracting: true }, 'SUBCONTRACTING', 'blocking'],
  ] as const)('evaluates boundary case %o', (answers, ruleId, severity) => {
    const finding = evaluateRisks(answers).find((item) => item.ruleId === ruleId);
    expect(finding).toMatchObject({ triggered: true, severity });
  });

  it('requires 40 percent prepayment for B-rated back-to-back customer', () => {
    const finding = evaluateRisks({
      chainLevel: 'first_subcontractor',
      isBackToBackPayment: true,
      isQualityWhitelistCustomer: false,
      customerRating: 'B',
      prepaymentPercent: 20,
    }).find((item) => item.ruleId === 'PAYMENT_TERMS');

    expect(finding).toMatchObject({ triggered: true, severity: 'high' });
    expect(finding?.reason).toContain('40%');
  });

  it('records whitelist back-to-back payment as an escalation risk', () => {
    const finding = evaluateRisks({
      chainLevel: 'first_subcontractor',
      isBackToBackPayment: true,
      isQualityWhitelistCustomer: true,
    }).find((item) => item.ruleId === 'PAYMENT_TERMS');

    expect(finding).toMatchObject({ triggered: true, severity: 'medium' });
    expect(finding?.reason).toContain('升级审批');
  });

  it('does not require an upstream contract for a direct-signing project', () => {
    const chain = evaluateRisks({
      chainLevel: 'direct',
      fundingPartyConfirmed: true,
    }).find((item) => item.ruleId === 'CONTRACT_CHAIN');

    expect(chain).toMatchObject({ triggered: false, missingKeys: [] });
  });

  it('does not treat a populated external rating as missing evidence', () => {
    const findings = evaluateRisks({
      customerRating: '集团战略客户',
      customerCollectionHealth: 1,
      chainLevel: 'first_subcontractor',
      isBackToBackPayment: true,
      isQualityWhitelistCustomer: false,
      prepaymentPercent: 20,
    });
    const credit = findings.find((item) => item.ruleId === 'CUSTOMER_CREDIT');
    const payment = findings.find((item) => item.ruleId === 'PAYMENT_TERMS');

    expect(credit).toMatchObject({ triggered: true, severity: 'medium', missingKeys: [] });
    expect(payment).toMatchObject({ triggered: true, severity: 'medium', missingKeys: [] });
    expect(credit?.reason).toContain('集团战略客户');
  });

  it('accepts the normalized downstream subcontractor value as chain evidence', () => {
    const longChain = evaluateRisks({
      salesBg: 'TSG',
      chainLevel: 'downstream_subcontractor',
      nonOperatorCount: 2,
    }, { templateVersion: '2026-08' }).filter((item) => item.ruleId === 'TSG_LONG_CHAIN');

    expect(longChain.length).toBeGreaterThan(0);
    expect(longChain.every((item) => item.missingKeys.length === 0)).toBe(true);
  });

  it('keeps blacklist payment as a review risk without requesting the rating again', () => {
    const payment = evaluateRisks({
      customerRating: '一级黑名单客户',
      customerCollectionHealth: 1,
      chainLevel: 'first_subcontractor',
      isBackToBackPayment: true,
      isQualityWhitelistCustomer: false,
      prepaymentPercent: 0,
    }).find((item) => item.ruleId === 'PAYMENT_TERMS');

    expect(payment).toMatchObject({ triggered: true, severity: 'high', missingKeys: [] });
  });

  it('uses strict direct-financing exception boundaries', () => {
    const oneCase = evaluateRisks({
      hasProcurement: true,
      advanceProcurement: false,
      hasFinancing: true,
      directFinancingAmount: 499_999,
      directFinancingMonths: 2.9,
      potentialFinancingAmount: 0,
    }).find((item) => item.ruleId === 'PROCUREMENT_PAYMENT');
    const high = evaluateRisks({
      hasProcurement: true,
      advanceProcurement: false,
      hasFinancing: true,
      directFinancingAmount: 500_000,
      directFinancingMonths: 2,
      potentialFinancingAmount: 0,
    }).find((item) => item.ruleId === 'PROCUREMENT_PAYMENT');

    expect(oneCase).toMatchObject({ triggered: true, severity: 'medium' });
    expect(oneCase?.reason).toContain('一事一议');
    expect(high).toMatchObject({ triggered: true, severity: 'high' });
  });

  it('uses inclusive potential-financing exception boundary', () => {
    const finding = evaluateRisks({
      hasProcurement: true,
      advanceProcurement: false,
      hasFinancing: true,
      directFinancingAmount: 0,
      directFinancingMonths: 0,
      potentialFinancingAmount: 2_000_000,
    }).find((item) => item.ruleId === 'PROCUREMENT_PAYMENT');

    expect(finding).toMatchObject({ triggered: true, severity: 'medium' });
  });

  it('returns evidence gaps instead of guessing', () => {
    const finding = evaluateRisks({ customerRating: 'D' }).find(
      (item) => item.ruleId === 'CUSTOMER_CREDIT',
    );

    expect(finding).toMatchObject({ triggered: false });
    expect(finding?.missingKeys).toContain('prepaymentPercent');
    expect(finding?.followUpQuestions[0]).toContain('预付款');
  });

  it('skips procurement findings when procurement is false', () => {
    const findings = evaluateRisks({ hasProcurement: false });
    expect(findings.filter((item) => item.category === 'procurement')).toHaveLength(0);
  });

  it('does not execute an AI-generated condition until human approval', () => {
    const baseline = defaultRiskConfiguration('2026-08-17T00:00:00.000Z');
    const customRule = {
      id: 'CUSTOM_LOW_MARGIN',
      name: 'AI建议低利润风险',
      scope: 'DIG' as const,
      level: 'principle' as const,
      category: '项目利润' as const,
      riskPoint: 'GM1过低',
      requirement: '原则禁止，需人工复核。',
      question: '请确认 GM1。',
      source: 'test',
      status: 'active' as const,
      conditionField: 'gm1',
      conditionOperator: 'lte' as const,
      conditionValue: '5',
      conditionSource: 'ai' as const,
      conditionReviewStatus: 'pending_review' as const,
      conditionExplanation: 'test',
    };
    setRuntimeRiskConfiguration({ ...baseline, rules: [...baseline.rules, customRule] });
    const pending = evaluateRisks({ salesBg: 'DIG', gm1: 5 }, { templateVersion: '2026-08' }).find((item) => item.ruleId === customRule.id);
    expect(pending).toBeUndefined();

    setRuntimeRiskConfiguration({ ...baseline, rules: [...baseline.rules, { ...customRule, conditionReviewStatus: 'approved' as const }] });
    const approved = evaluateRisks({ salesBg: 'DIG', gm1: 5 }, { templateVersion: '2026-08' }).find((item) => item.ruleId === customRule.id);
    expect(approved).toMatchObject({ triggered: true, severity: 'high' });
  });

  it('returns only company and selected BG rules and honors disabled built-in rules', () => {
    const baseline = defaultRiskConfiguration('2026-08-17T00:00:00.000Z');
    setRuntimeRiskConfiguration({
      ...baseline,
      rules: baseline.rules.map((rule) => rule.id === 'DIG_LOW_MARGIN' ? { ...rule, status: 'disabled' as const } : rule),
    });
    const findings = evaluateRisks({ salesBg: 'DIG', gm1: 3 }, { templateVersion: '2026-08' });
    expect(findings.some((item) => item.ruleId === 'DIG_LOW_MARGIN')).toBe(false);
    expect(findings.some((item) => item.ruleId.startsWith('TSG_') || item.ruleId.startsWith('SCG_'))).toBe(false);
  });

  it('supports approved field-to-field comparisons', () => {
    const baseline = defaultRiskConfiguration('2026-08-17T00:00:00.000Z');
    setRuntimeRiskConfiguration({
      ...baseline,
      rules: baseline.rules.map((rule) => rule.id === 'COMPANY_EMPTY_TURNOVER'
        ? { ...rule, conditionField: 'customerName', conditionCompareMode: 'field' as const, conditionValueField: 'supplierName', conditionOperator: 'equals' as const, conditionSource: 'manual' as const, conditionReviewStatus: 'approved' as const }
        : rule),
    });
    const finding = evaluateRisks({ salesBg: 'DIG', customerName: '甲公司', supplierName: '甲公司' }, { templateVersion: '2026-08' }).find((item) => item.ruleId === 'COMPANY_EMPTY_TURNOVER');
    expect(finding).toMatchObject({ triggered: true, severity: 'blocking' });
  });
});
