import { describe, expect, it } from 'vitest';
import { extractFallbackSalesAnswers, fallbackSalesClarification, normalizeCommitmentValue } from '../fallback-extraction';

describe('fallback sales extraction', () => {
  it('extracts explicit negative risk answers and project value from the screenshot scenario', () => {
    const result = extractFallbackSalesAnswers({ answers: { salesBg: { value: 'TSG', source: 'sales', updatedAt: '' } } }, '这个项目不是空转项目，也不是融资性贸易或融资担保，不是非本BG主业，属于运营商业务。整体战略价值是为公司提供新的项目投入机会，后续会继续和安徽广电合作。');

    expect(result.values).toMatchObject({
      isEmptyTurnoverContract: false,
      isFinancingTradeContract: false,
      hasNonMainBusiness: false,
      strategicAlignment: expect.any(String),
      projectContinuity: expect.any(String),
    });
    expect(result.riskAssessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'TSG_NON_MAIN_BUSINESS', result: 'clear' }),
      expect.objectContaining({ ruleId: 'COMPANY_EMPTY_TURNOVER', result: 'clear' }),
      expect.objectContaining({ ruleId: 'COMPANY_FINANCING_TRADE', result: 'clear' }),
    ]));
  });

  it('extracts zero prepayment, payment mode, procurement and direct financing negatives', () => {
    const result = extractFallbackSalesAnswers({ answers: { salesBg: { value: 'DIG', source: 'sales', updatedAt: '' } } }, '没有预付款，验收后百分百付款，不是背靠背；没有采购，也没有直接垫资或潜在垫资。');

    expect(result.values).toMatchObject({
      prepaymentPercent: 0,
      isBackToBackPayment: false,
      hasProcurement: false,
      hasDirectFinancing: false,
      hasPotentialFinancing: false,
    });
  });

  it('extracts commitment and risk-control answers from one natural-language response', () => {
    const result = extractFallbackSalesAnswers({ answers: { salesBg: { value: 'TSG', source: 'sales', updatedAt: '' } } }, '签约风险无新增风险；交付风险无新增风险。回款承诺是首笔回款在2026年10月，全部回款在2027年3月，按验收和开票节点，由销售经理负责并建立台账；利润承诺守住GM1 10%，由事业部负责人每月复核成本；交付承诺2027年2月完成交付、3月完成验收，按合同验收标准，由交付经理负责；新商机承诺是2027年6月形成扩容项目，由销售经理负责并每月跟进。');

    expect(result.values).toMatchObject({
      contractRiskControl: expect.any(String),
      deliveryRiskControl: expect.any(String),
      collectionCommitment: expect.any(String),
      marginCommitment: expect.any(String),
      deliveryCommitment: expect.any(String),
      newOpportunityCommitment: expect.any(String),
    });
  });

  it('answers clarification questions instead of replaying the same batch without context', () => {
    expect(fallbackSalesClarification('什么是空转项目？')).toContain('真实业务需求');
    expect(fallbackSalesClarification('背靠背付款是什么意思？')).toContain('上游');
  });

  it('keeps model-written commitments scoped to their own field', () => {
    const value = '签约风险无新增。回款承诺首笔回款在2026年10月，全部回款在2027年3月。利润承诺守住GM1 10%。交付承诺2027年2月完成交付。';
    expect(normalizeCommitmentValue('collectionCommitment', value)).toContain('回款承诺');
    expect(normalizeCommitmentValue('collectionCommitment', value)).not.toContain('利润承诺');
    expect(normalizeCommitmentValue('marginCommitment', value)).not.toContain('交付承诺');
  });
});
