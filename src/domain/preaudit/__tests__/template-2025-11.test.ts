import { describe, expect, it } from 'vitest';
import { PREAUDIT_TEMPLATE_2025_11 } from '../template-2025-11';

describe('PREAUDIT_TEMPLATE_2025_11', () => {
  it('uses a stable token and exact workbook anchors', () => {
    expect(PREAUDIT_TEMPLATE_2025_11.token).toBe('preaudit202511');
    expect(PREAUDIT_TEMPLATE_2025_11.sheetName).toBe('域外合同前置审批表-2025年11月启用');
    expect(PREAUDIT_TEMPLATE_2025_11.anchors).toEqual({
      B2: '域外合同前置特批审批表',
      B49: '后台部门建议',
    });
  });

  it('maps every feedback row and does not duplicate field keys', () => {
    const keys = PREAUDIT_TEMPLATE_2025_11.fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PREAUDIT_TEMPLATE_2025_11.riskCells).toEqual({
      customerCredit: 'G8',
      contractChain: 'G9',
      paymentTerms: 'G10',
      projectMargin: 'G11',
      pureProcurement: 'G12',
      supplierCredit: 'G14',
      procurementPayment: 'G15',
      subcontracting: 'G16',
    });
    expect(PREAUDIT_TEMPLATE_2025_11.fields.some((field) => field.targetCells.includes('E48'))).toBe(true);
  });

  it('marks procurement questions conditional', () => {
    const supplier = PREAUDIT_TEMPLATE_2025_11.fields.find((field) => field.key === 'supplierName');
    expect(supplier?.requiredWhen).toEqual({ field: 'hasProcurement', equals: true });
  });

  it('includes every structured input used by the risk engine', () => {
    const keys = new Set(PREAUDIT_TEMPLATE_2025_11.fields.map((field) => field.key));
    for (const key of [
      'hasProcurement',
      'chainLevel',
      'isBackToBackPayment',
      'prepaymentPercent',
      'hasChannelFee',
      'externalProcurementPercent',
      'thirdPartyCoreDelivery',
      'supplierPaidInCapital',
      'procurementAmount',
      'supplierEntityType',
      'supplierRating',
      'advanceProcurement',
      'directFinancingAmount',
      'directFinancingMonths',
      'potentialFinancingAmount',
      'allowsUnauthorizedSubcontracting',
    ]) {
      expect(keys.has(key), `missing risk input ${key}`).toBe(true);
    }
  });
});
