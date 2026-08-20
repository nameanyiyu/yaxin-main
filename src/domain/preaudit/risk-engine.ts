import { resolveCustomerRating } from './customer-rating';
import { customerListMatch, getRuntimeRiskConfiguration, type RiskRuleConfig } from './risk-config';
import type { RiskFinding } from './types';

type Answers = Record<string, unknown>;
type Severity = RiskFinding['severity'];

const REQUIRED_PREPAYMENT: Record<string, number> = { S: 10, A: 20, B: 40, C: 60, D: 100 };

const FOLLOW_UP: Record<string, string> = {
  salesBg: '请确认所属 BG。',
  aisFinancingDecision: '请提供 AIS 垫资业务对应的公司决议或管理意见。',
  customerRating: '请确认签约客户评级。',
  customerCollectionHealth: '请确认客户回款健康度等级。',
  prepaymentPercent: '请确认客户预付款比例。',
  chainLevel: '请确认我司在签约链条中的层级。',
  upstreamSigned: '请确认上游合同是否已签署。',
  fundingPartyConfirmed: '请确认资金方是否已经明确。',
  isBackToBackPayment: '请确认付款条款是否背靠背。',
  isQualityWhitelistCustomer: '请确认客户是否属于优质白名单。',
  gm1: '请确认项目 GM1 百分比。',
  hasChannelFee: '请确认是否涉及销售渠道费用。',
  externalProcurementPercent: '请确认外采成本占比。',
  thirdPartyCoreDelivery: '请确认第三方是否承担核心交付责任。',
  supplierPaidInCapital: '请确认供应商实缴资本。',
  procurementAmount: '请确认项目采购金额。',
  supplierEntityType: '请确认供应商主体类型。',
  supplierRating: '请确认供应商评级。',
  advanceProcurement: '请确认是否存在提前采购。',
  hasFinancing: '请确认是否存在直接或潜在垫资。',
  directFinancingAmount: '请确认直接垫资金额。',
  directFinancingMonths: '请确认直接垫资期限。',
  potentialFinancingAmount: '请确认潜在垫资金额。',
  allowsUnauthorizedSubcontracting: '请确认合同是否禁止未经许可的二次分包。',
};

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function missingFinding(
  ruleId: string,
  category: RiskFinding['category'],
  title: string,
  missingKeys: string[],
  severity: Severity = 'medium',
): RiskFinding {
  return {
    ruleId,
    category,
    title,
    triggered: false,
    severity,
    reason: '信息不足，暂不判断。',
    impact: '需补齐证据后重新评估。',
    evidenceKeys: [],
    missingKeys,
    followUpQuestions: missingKeys.map((key) => FOLLOW_UP[key] ?? `请补充${key}。`),
  };
}

function finding(input: Omit<RiskFinding, 'missingKeys' | 'followUpQuestions'>): RiskFinding {
  return { ...input, missingKeys: [], followUpQuestions: [] };
}

function clearFinding(
  ruleId: string,
  category: RiskFinding['category'],
  title: string,
  evidenceKeys: string[],
): RiskFinding {
  return finding({
    ruleId,
    category,
    title,
    triggered: false,
    severity: 'medium',
    reason: '现有证据未命中本规则。',
    impact: '无额外规则处置要求。',
    evidenceKeys,
  });
}

function evaluateCustomerCredit(answers: Answers): RiskFinding {
  const rating = resolveCustomerRating(answers.customerRating);
  const health = numberValue(answers.customerCollectionHealth);

  if (rating.blacklisted || health === 5) {
    return finding({
      ruleId: 'CUSTOMER_CREDIT',
      category: 'sales',
      title: '签约客户资信',
      triggered: true,
      severity: 'blocking',
      reason: health === 5 ? '客户回款健康度为 5 级。' : `客户评级“${rating.input}”已识别为黑名单客户。`,
      impact: '不满足常规签约准入条件，应升级处理；该风险提示不阻断资料送交后台复核。',
      evidenceKeys: health === 5 ? ['customerCollectionHealth'] : ['customerRating'],
    });
  }

  if (rating.canonical === 'D') {
    const prepayment = numberValue(answers.prepaymentPercent);
    if (prepayment === undefined) {
      return missingFinding('CUSTOMER_CREDIT', 'sales', '签约客户资信', ['prepaymentPercent'], 'high');
    }
    if (prepayment < 100) {
      return finding({
        ruleId: 'CUSTOMER_CREDIT',
        category: 'sales',
        title: '签约客户资信',
        triggered: true,
        severity: 'high',
        reason: `D 级客户要求 100% 预付款，当前为 ${prepayment}%。`,
        impact: '存在显著回款风险，需补足预付款或升级审批。',
        evidenceKeys: ['customerRating', 'prepaymentPercent'],
      });
    }
  }

  const missing = [
    ...(rating.input ? [] : ['customerRating']),
    ...(health === undefined ? ['customerCollectionHealth'] : []),
  ];
  if (missing.length) return missingFinding('CUSTOMER_CREDIT', 'sales', '签约客户资信', missing);
  if (!rating.recognized) {
    return finding({
      ruleId: 'CUSTOMER_CREDIT',
      category: 'sales',
      title: '签约客户资信',
      triggered: true,
      severity: 'medium',
      reason: `客户评级“${rating.input}”尚未映射到本地标准评级。`,
      impact: '保留原始评级并提示后台人工核验；未来可通过客户评级 CLI 接入外部系统，不阻断本次送审。',
      evidenceKeys: ['customerRating', 'customerCollectionHealth'],
    });
  }
  return clearFinding('CUSTOMER_CREDIT', 'sales', '签约客户资信', ['customerRating', 'customerCollectionHealth']);
}

function evaluateContractChain(answers: Answers): RiskFinding {
  const chainLevel = stringValue(answers.chainLevel);
  if (chainLevel && !['direct', 'first_subcontractor'].includes(chainLevel)) {
    return finding({
      ruleId: 'CONTRACT_CHAIN',
      category: 'sales',
      title: '签约链条',
      triggered: true,
      severity: 'high',
      reason: '我司处于一级分包之后的签约链条。',
      impact: '链条过长会放大签约、验收和回款不确定性。',
      evidenceKeys: ['chainLevel'],
    });
  }

  const upstreamSigned = booleanValue(answers.upstreamSigned);
  const fundingPartyConfirmed = booleanValue(answers.fundingPartyConfirmed);
  const missing = [
    ...(chainLevel ? [] : ['chainLevel']),
    ...(chainLevel !== 'direct' && upstreamSigned === undefined ? ['upstreamSigned'] : []),
    ...(fundingPartyConfirmed === undefined ? ['fundingPartyConfirmed'] : []),
  ];
  if (missing.length) return missingFinding('CONTRACT_CHAIN', 'sales', '签约链条', missing);

  if ((chainLevel !== 'direct' && !upstreamSigned) || !fundingPartyConfirmed) {
    return finding({
      ruleId: 'CONTRACT_CHAIN',
      category: 'sales',
      title: '签约链条',
      triggered: true,
      severity: 'high',
      reason: !upstreamSigned ? '上游合同尚未签署。' : '项目资金方尚未明确。',
      impact: '签约或资金链条尚未闭合。',
      evidenceKeys: ['chainLevel', 'upstreamSigned', 'fundingPartyConfirmed'],
    });
  }
  return clearFinding('CONTRACT_CHAIN', 'sales', '签约链条', [
    'chainLevel',
    'upstreamSigned',
    'fundingPartyConfirmed',
  ]);
}

function evaluatePaymentTerms(answers: Answers): RiskFinding {
  const chainLevel = stringValue(answers.chainLevel);
  if (!chainLevel) return missingFinding('PAYMENT_TERMS', 'sales', '付款形式', ['chainLevel']);
  if (chainLevel === 'direct') return clearFinding('PAYMENT_TERMS', 'sales', '付款形式', ['chainLevel']);

  const backToBack = booleanValue(answers.isBackToBackPayment);
  if (backToBack === undefined) {
    return missingFinding('PAYMENT_TERMS', 'sales', '付款形式', ['isBackToBackPayment']);
  }
  if (!backToBack) {
    return clearFinding('PAYMENT_TERMS', 'sales', '付款形式', ['chainLevel', 'isBackToBackPayment']);
  }

  const whitelist = booleanValue(answers.isQualityWhitelistCustomer);
  if (whitelist === undefined) {
    return missingFinding('PAYMENT_TERMS', 'sales', '付款形式', ['isQualityWhitelistCustomer']);
  }
  if (whitelist) {
    return finding({
      ruleId: 'PAYMENT_TERMS',
      category: 'sales',
      title: '付款形式',
      triggered: true,
      severity: 'medium',
      reason: '优质白名单客户采用背靠背付款，需进入升级审批。',
      impact: '保留付款条件风险并由有权人员复核。',
      evidenceKeys: ['chainLevel', 'isBackToBackPayment', 'isQualityWhitelistCustomer'],
    });
  }

  const rating = resolveCustomerRating(answers.customerRating);
  const prepayment = numberValue(answers.prepaymentPercent);
  const missing = [...(rating.input ? [] : ['customerRating']), ...(prepayment === undefined ? ['prepaymentPercent'] : [])];
  if (!rating.input || prepayment === undefined) {
    return missingFinding('PAYMENT_TERMS', 'sales', '付款形式', missing, 'high');
  }

  if (rating.blacklisted) {
    return finding({
      ruleId: 'PAYMENT_TERMS',
      category: 'sales',
      title: '付款形式',
      triggered: true,
      severity: 'high',
      reason: `黑名单客户采用背靠背付款，当前预付款比例为 ${prepayment}%。`,
      impact: '进入后台升级复核，不因本地评级映射再次要求销售补填。',
      evidenceKeys: ['chainLevel', 'isBackToBackPayment', 'customerRating', 'prepaymentPercent'],
    });
  }
  if (!rating.recognized || !rating.canonical) {
    return finding({
      ruleId: 'PAYMENT_TERMS',
      category: 'sales',
      title: '付款形式',
      triggered: true,
      severity: 'medium',
      reason: `客户评级“${rating.input}”待外部评级系统映射，当前预付款比例为 ${prepayment}%。`,
      impact: '保留后台人工核验提示，不阻断资料送审。',
      evidenceKeys: ['chainLevel', 'isBackToBackPayment', 'customerRating', 'prepaymentPercent'],
    });
  }
  const required = REQUIRED_PREPAYMENT[rating.canonical];
  if (prepayment < required) {
    return finding({
      ruleId: 'PAYMENT_TERMS',
      category: 'sales',
      title: '付款形式',
      triggered: true,
      severity: 'high',
      reason: `${rating.canonical} 级客户最低要求 ${required}% 预付款，当前为 ${prepayment}%。`,
      impact: '背靠背付款条件下存在垫资和回款风险。',
      evidenceKeys: ['chainLevel', 'isBackToBackPayment', 'customerRating', 'prepaymentPercent'],
    });
  }
  return clearFinding('PAYMENT_TERMS', 'sales', '付款形式', [
    'chainLevel',
    'isBackToBackPayment',
    'customerRating',
    'prepaymentPercent',
  ]);
}

function evaluateProjectMargin(answers: Answers): RiskFinding {
  const gm1 = numberValue(answers.gm1);
  if (gm1 === undefined) return missingFinding('PROJECT_MARGIN', 'sales', '项目利润', ['gm1']);
  if (gm1 <= 5) {
    return finding({
      ruleId: 'PROJECT_MARGIN',
      category: 'sales',
      title: '项目利润',
      triggered: true,
      severity: 'blocking',
      reason: `GM1 为 ${gm1}%，小于或等于 5%。`,
      impact: '项目利润不满足准入底线。',
      evidenceKeys: ['gm1'],
    });
  }
  const hasChannelFee = booleanValue(answers.hasChannelFee);
  if (hasChannelFee === undefined) {
    return missingFinding('PROJECT_MARGIN', 'sales', '项目利润', ['hasChannelFee']);
  }
  if (hasChannelFee && gm1 <= 15) {
    return finding({
      ruleId: 'PROJECT_MARGIN',
      category: 'sales',
      title: '项目利润',
      triggered: true,
      severity: 'high',
      reason: `涉及渠道费用且 GM1 为 ${gm1}%，未高于 15%。`,
      impact: '渠道费用可能进一步侵蚀项目利润。',
      evidenceKeys: ['gm1', 'hasChannelFee'],
    });
  }
  return clearFinding('PROJECT_MARGIN', 'sales', '项目利润', ['gm1', 'hasChannelFee']);
}

function evaluatePureProcurement(answers: Answers): RiskFinding {
  const percent = numberValue(answers.externalProcurementPercent);
  const coreDelivery = booleanValue(answers.thirdPartyCoreDelivery);
  const missing = [
    ...(percent === undefined ? ['externalProcurementPercent'] : []),
    ...(coreDelivery === undefined ? ['thirdPartyCoreDelivery'] : []),
  ];
  if (percent !== undefined && percent >= 85) {
    return finding({
      ruleId: 'PURE_PROCUREMENT',
      category: 'procurement',
      title: '纯外采项目',
      triggered: true,
      severity: 'high',
      reason: `外采成本占比为 ${percent}%，达到 85% 风险线。`,
      impact: '项目价值与交付能力对外部供应商依赖较高。',
      evidenceKeys: ['externalProcurementPercent'],
    });
  }
  if (coreDelivery) {
    return finding({
      ruleId: 'PURE_PROCUREMENT',
      category: 'procurement',
      title: '纯外采项目',
      triggered: true,
      severity: 'high',
      reason: '第三方承担核心交付责任。',
      impact: '核心交付能力和责任不在我司直接控制范围内。',
      evidenceKeys: ['thirdPartyCoreDelivery'],
    });
  }
  return missing.length
    ? missingFinding('PURE_PROCUREMENT', 'procurement', '纯外采项目', missing)
    : clearFinding('PURE_PROCUREMENT', 'procurement', '纯外采项目', [
        'externalProcurementPercent',
        'thirdPartyCoreDelivery',
      ]);
}

function evaluateSupplierCredit(answers: Answers): RiskFinding {
  const entityType = stringValue(answers.supplierEntityType)?.toLowerCase();
  const rating = stringValue(answers.supplierRating)?.toUpperCase();
  const capital = numberValue(answers.supplierPaidInCapital);
  const amount = numberValue(answers.procurementAmount);

  if (entityType === 'individual' || entityType === '个体工商户' || rating === 'D' || rating === 'BLACK' || rating === '黑名单') {
    return finding({
      ruleId: 'SUPPLIER_CREDIT',
      category: 'procurement',
      title: '供应商资信',
      triggered: true,
      severity: 'blocking',
      reason: entityType === 'individual' || entityType === '个体工商户' ? '供应商为个体工商户。' : `供应商评级为 ${rating}。`,
      impact: '供应商主体或资信不满足准入要求。',
      evidenceKeys: entityType === 'individual' || entityType === '个体工商户' ? ['supplierEntityType'] : ['supplierRating'],
    });
  }
  if (capital !== undefined && amount !== undefined && capital < amount) {
    return finding({
      ruleId: 'SUPPLIER_CREDIT',
      category: 'procurement',
      title: '供应商资信',
      triggered: true,
      severity: 'high',
      reason: `供应商实缴资本 ${capital} 元低于采购金额 ${amount} 元。`,
      impact: '供应商履约和赔付能力可能不足。',
      evidenceKeys: ['supplierPaidInCapital', 'procurementAmount'],
    });
  }
  const missing = [
    ...(entityType ? [] : ['supplierEntityType']),
    ...(rating ? [] : ['supplierRating']),
    ...(capital === undefined ? ['supplierPaidInCapital'] : []),
    ...(amount === undefined ? ['procurementAmount'] : []),
  ];
  return missing.length
    ? missingFinding('SUPPLIER_CREDIT', 'procurement', '供应商资信', missing)
    : clearFinding('SUPPLIER_CREDIT', 'procurement', '供应商资信', [
        'supplierEntityType',
        'supplierRating',
        'supplierPaidInCapital',
        'procurementAmount',
      ]);
}

function evaluateProcurementPayment(answers: Answers): RiskFinding {
  const advance = booleanValue(answers.advanceProcurement);
  const hasFinancing = booleanValue(answers.hasFinancing);
  const initialMissing = [
    ...(advance === undefined ? ['advanceProcurement'] : []),
    ...(hasFinancing === undefined ? ['hasFinancing'] : []),
  ];
  if (initialMissing.length) {
    return missingFinding('PROCUREMENT_PAYMENT', 'procurement', '采购付款条款', initialMissing);
  }
  if (advance) {
    return finding({
      ruleId: 'PROCUREMENT_PAYMENT',
      category: 'procurement',
      title: '采购付款条款',
      triggered: true,
      severity: 'high',
      reason: '项目存在提前采购。',
      impact: '采购付款可能早于销售合同和客户回款。',
      evidenceKeys: ['advanceProcurement'],
    });
  }
  if (!hasFinancing) {
    return clearFinding('PROCUREMENT_PAYMENT', 'procurement', '采购付款条款', [
      'advanceProcurement',
      'hasFinancing',
    ]);
  }

  const directAmount = numberValue(answers.directFinancingAmount);
  const directMonths = numberValue(answers.directFinancingMonths);
  const potentialAmount = numberValue(answers.potentialFinancingAmount);
  const missing = [
    ...(directAmount === undefined ? ['directFinancingAmount'] : []),
    ...(directMonths === undefined ? ['directFinancingMonths'] : []),
    ...(potentialAmount === undefined ? ['potentialFinancingAmount'] : []),
  ];
  if (directAmount === undefined || directMonths === undefined || potentialAmount === undefined) {
    return missingFinding('PROCUREMENT_PAYMENT', 'procurement', '采购付款条款', missing, 'high');
  }

  const reasons: string[] = [];
  let severity: Severity = 'medium';
  if (directAmount > 0) {
    if (directAmount < 500_000 && directMonths < 3) {
      reasons.push(`直接垫资 ${directAmount} 元、${directMonths} 个月，需一事一议。`);
    } else {
      severity = 'high';
      reasons.push(`直接垫资 ${directAmount} 元、${directMonths} 个月，不满足小于 50 万且小于 3 个月的例外。`);
    }
  }
  if (potentialAmount > 0) {
    if (potentialAmount <= 2_000_000) {
      reasons.push(`潜在垫资 ${potentialAmount} 元，需一事一议。`);
    } else {
      severity = 'high';
      reasons.push(`潜在垫资 ${potentialAmount} 元，超过 200 万元。`);
    }
  }
  if (!reasons.length) {
    return clearFinding('PROCUREMENT_PAYMENT', 'procurement', '采购付款条款', [
      'advanceProcurement',
      'hasFinancing',
      'directFinancingAmount',
      'directFinancingMonths',
      'potentialFinancingAmount',
    ]);
  }
  return finding({
    ruleId: 'PROCUREMENT_PAYMENT',
    category: 'procurement',
    title: '采购付款条款',
    triggered: true,
    severity,
    reason: reasons.join(' '),
    impact: severity === 'high' ? '项目存在显著资金占用风险。' : '需按一事一议流程复核资金占用。',
    evidenceKeys: ['directFinancingAmount', 'directFinancingMonths', 'potentialFinancingAmount'],
  });
}

function evaluateSubcontracting(answers: Answers): RiskFinding {
  const allows = booleanValue(answers.allowsUnauthorizedSubcontracting);
  if (allows === undefined) {
    return missingFinding('SUBCONTRACTING', 'procurement', '避免二次分包', [
      'allowsUnauthorizedSubcontracting',
    ]);
  }
  if (allows) {
    return finding({
      ruleId: 'SUBCONTRACTING',
      category: 'procurement',
      title: '避免二次分包',
      triggered: true,
      severity: 'blocking',
      reason: '合同允许供应商未经许可进行二次分包。',
      impact: '核心责任可能继续转移，交付和追责链条不可控。',
      evidenceKeys: ['allowsUnauthorizedSubcontracting'],
    });
  }
  return clearFinding('SUBCONTRACTING', 'procurement', '避免二次分包', [
    'allowsUnauthorizedSubcontracting',
  ]);
}

function newFinding(
  ruleId: string,
  title: string,
  triggered: boolean,
  severity: Severity,
  reason: string,
  impact: string,
  evidenceKeys: string[] = [],
): RiskFinding {
  const configured = configuredRule(ruleId);
  const configuredSeverity: Severity | undefined = configured?.level === 'absolute'
    ? 'blocking'
    : configured?.level === 'principle'
      ? 'high'
      : configured?.level === 'approval'
        ? 'medium'
        : undefined;
  return {
    ruleId,
    category: configured?.category === '供应商资信' ? 'procurement' : 'sales',
    title: configured?.name?.trim() || configured?.riskPoint?.trim() || title,
    triggered,
    severity: configuredSeverity ?? severity,
    ...(configured ? { controlLevel: configured.level, controlRequirement: configured.requirement } : {}),
    reason,
    impact,
    evidenceKeys,
    missingKeys: [],
    followUpQuestions: [],
  };
}

function newMissing(ruleId: string, title: string, missingKeys: string[], severity: Severity = 'medium'): RiskFinding {
  const configured = getRuntimeRiskConfiguration().rules.find((item) => item.id === ruleId);
  const configuredQuestion = configured?.question?.trim();
  return {
    ruleId,
    category: configured?.category === '供应商资信' ? 'procurement' : 'sales',
    title: configured?.name?.trim() || configured?.riskPoint?.trim() || title,
    triggered: false,
    severity,
    ...(configured ? { controlLevel: configured.level, controlRequirement: configured.requirement } : {}),
    reason: '信息不足，暂不判断。',
    impact: '补齐证据后重新评估；未定义的自动阈值不由系统臆测。',
    evidenceKeys: [],
    missingKeys,
    followUpQuestions: configuredQuestion
      ? [configuredQuestion]
      : missingKeys.map((key) => FOLLOW_UP[key] ?? `请补充${key}。`),
  };
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function bgOf(value: unknown): 'TSG' | 'DIG' | 'SCG' | undefined {
  const bg = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (bg === 'SIG') return 'SCG';
  return bg === 'TSG' || bg === 'DIG' || bg === 'SCG' ? bg : undefined;
}

function chainRank(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return undefined;
  if (text === 'direct' || text.includes('直签')) return 0;
  if (text === 'first_subcontractor' || text.includes('一级') || text.includes('一层')) return 1;
  // The 2026 template intentionally stores "二级及更下级分包" as one
  // normalized value. Treat it as the conservative lower bound (second
  // subcontractor) so a completed answer is not reported as missing evidence;
  // the AI assessment and non-operator count still carry the exact long-chain
  // evidence when the narrative says third level or later.
  if (text === 'downstream_subcontractor' || text === 'second_subcontractor') return 2;
  if (text.includes('二级') || text.includes('二层')) return 2;
  if (text.includes('三级') || text.includes('三层')) return 3;
  if (text.includes('四级') || text.includes('四层') || text.includes('四层以后')) return 4;
  return undefined;
}

function configuredRule(ruleId: string) {
  return getRuntimeRiskConfiguration().rules.find((item) => item.id === ruleId);
}

function activeRule(ruleId: string): boolean {
  const configured = configuredRule(ruleId);
  return Boolean(configured && configured.status !== 'disabled');
}

function conditionValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value === undefined || value === null ? '' : String(value).trim();
}

function configuredConditionMatches(value: unknown, rule: RiskRuleConfig, answers: Answers): boolean {
  const actual = conditionValue(value);
  const expected = conditionValue(rule.conditionCompareMode === 'field' ? answers[rule.conditionValueField ?? ''] : rule.conditionValue);
  switch (rule.conditionOperator ?? 'equals') {
    case 'exists': return actual.length > 0;
    case 'not_equals': return actual.length > 0 && actual !== expected;
    case 'contains': return actual.includes(expected);
    case 'gt': return Number.isFinite(Number(actual)) && Number(actual) > Number(expected);
    case 'gte': return Number.isFinite(Number(actual)) && Number(actual) >= Number(expected);
    case 'lt': return Number.isFinite(Number(actual)) && Number(actual) < Number(expected);
    case 'lte': return Number.isFinite(Number(actual)) && Number(actual) <= Number(expected);
    case 'equals':
    default:
      return actual === expected;
  }
}

function evaluateCustomConfiguredRules(answers: Answers, bg: 'TSG' | 'DIG' | 'SCG'): RiskFinding[] {
  return getRuntimeRiskConfiguration().rules
    .filter((rule) => rule.status !== 'disabled' && rule.conditionField)
    .filter((rule) => rule.conditionSource !== 'ai' || rule.conditionReviewStatus === 'approved')
    .filter((rule) => rule.scope === 'COMPANY' || rule.scope === bg)
    .flatMap((rule) => {
      const field = rule.conditionField as string;
      const title = rule.name?.trim() || rule.riskPoint;
      const value = answers[field];
      const compareField = rule.conditionCompareMode === 'field' ? rule.conditionValueField?.trim() : undefined;
      const missingFields = [field, ...(compareField ? [compareField] : [])].filter((key) => answers[key] === undefined || answers[key] === null || answers[key] === '');
      if (missingFields.length > 0) {
        return [newMissing(rule.id, title, [...new Set(missingFields)], rule.level === 'absolute' ? 'high' : 'medium')];
      }
      if (!configuredConditionMatches(value, rule, answers)) return [];
      const severity: Severity = rule.level === 'absolute' ? 'blocking' : rule.level === 'principle' ? 'high' : 'medium';
      const expected = rule.conditionCompareMode === 'field' ? rule.conditionValueField : rule.conditionValue;
      return [newFinding(
        rule.id,
        title,
        true,
        severity,
        `命中配置风险条件：${field} ${rule.conditionOperator ?? 'equals'} ${expected ?? ''}`.trim(),
        rule.requirement || '请根据管控要求进行人工复核。',
        [field],
      )];
    });
}

function evaluateRisks2026(answers: Answers): RiskFinding[] {
  const bg = bgOf(answers.salesBg);
  if (!bg) return [newMissing('BG_REQUIRED', '所属 BG', ['salesBg'], 'high')];

  const findings: RiskFinding[] = [];
  const customerName = answers.customerName;
  const blacklist = customerListMatch(customerName, 'blacklist');
  const whitelist = customerListMatch(customerName, 'whitelist');
  const whitelistValue = bool(answers.isQualityWhitelistCustomer) ?? Boolean(whitelist);
  const blacklisted = (bool(answers.customerBlacklistMatch) ?? Boolean(blacklist)) || resolveCustomerRating(answers.customerRating).blacklisted;
  const health = numeric(answers.customerCollectionHealth);
  const rating = resolveCustomerRating(answers.customerRating);
  const prepayment = numeric(answers.prepaymentPercent);
  const financing = bool(answers.hasDirectFinancing);
  const directAmount = numeric(answers.directFinancingAmount);
  const months = numeric(answers.directFinancingMonths);
  const procurement = bool(answers.isPureProcurement);
  const procurementAmount = numeric(answers.externalProcurementAmount);
  const chain = chainRank(answers.chainLevel);

  if (activeRule('COMPANY_EMPTY_TURNOVER') && bool(answers.isEmptyTurnoverContract) === true) {
    findings.push(newFinding('COMPANY_EMPTY_TURNOVER', '空转合同', true, 'blocking', '项目被确认存在空转合同特征。', '公司级绝对禁止，不接受一事一议特批。', ['isEmptyTurnoverContract']));
  }
  if (activeRule('COMPANY_FINANCING_TRADE') && bool(answers.isFinancingTradeContract) === true) {
    findings.push(newFinding('COMPANY_FINANCING_TRADE', '融资性贸易/融资担保合同', true, 'blocking', '项目被确认存在融资性贸易或融资担保特征。', '公司级绝对禁止，不接受一事一议特批。', ['isFinancingTradeContract']));
  }

  if (blacklisted || health === 5) {
    findings.push(newFinding('COMPANY_CUSTOMER_BLACKLIST', '签约客户资信', true, 'blocking', health === 5 ? '客户回款健康度为5级-黑。' : `客户“${String(customerName ?? '')}”命中 E 级黑名单。`, '公司级绝对禁止；清单命中来源和 AR 回款健康度需要后台留痕。', ['customerName', 'customerRating', 'customerCollectionHealth']));
  } else if (!answers.customerName || !answers.customerRating || health === undefined) {
    findings.push(newMissing('COMPANY_CUSTOMER_BLACKLIST', '签约客户资信', ['customerName', 'customerRating', 'customerCollectionHealth'].filter((key) => answers[key] === undefined), 'high'));
  }

  if (financing === undefined) {
    findings.push(newMissing('COMPANY_DIRECT_FINANCING_OVER_200', '直接垫资', ['hasDirectFinancing'], 'high'));
  } else if (financing && directAmount === undefined) {
    findings.push(newMissing('COMPANY_DIRECT_FINANCING_OVER_200', '直接垫资', ['directFinancingAmount'], 'high'));
  } else if (financing && directAmount !== undefined && directAmount > 2_000_000 && !bool(answers.isAisBusiness) && !bool(answers.isScgAllInOneMachine)) {
    findings.push(newFinding('COMPANY_DIRECT_FINANCING_OVER_200', '直接垫资超过200万元', true, 'blocking', `直接垫资金额为 ${directAmount} 元，超过200万元。`, '公司级绝对禁止；AIS 和 SCG 自有软硬件一体机例外需按专项规则留痕。', ['hasDirectFinancing', 'directFinancingAmount']));
  }

  if (bg === 'TSG' && bool(answers.hasNonMainBusiness) === true && !whitelistValue) {
    findings.push(newFinding('TSG_NON_MAIN_BUSINESS', '非 TSG 主业业务', true, 'blocking', '项目属于非 TSG 主业且客户未命中白名单。', '不允许签署非运营商客户项目；白名单例外需保留清单证据。', ['hasNonMainBusiness', 'customerName']));
  }
  if (bg === 'TSG' && financing && directAmount !== undefined && directAmount > 2_000_000 && !bool(answers.is5gPrivateNetwork)) {
    findings.push(newFinding('TSG_DIRECT_FINANCING_OVER_200', 'TSG 大额直接垫资', true, 'blocking', `直接垫资金额为 ${directAmount} 元，超过200万元。`, 'TSG 绝对禁止；5G 专网项目需适用专项判断。', ['directFinancingAmount']));
  }
  if (bg === 'DIG' && financing && directAmount !== undefined && directAmount > 2_000_000 && !bool(answers.isAisBusiness)) {
    findings.push(newFinding('DIG_DIRECT_FINANCING_OVER_200', 'DIG 大额直接垫资', true, 'blocking', `直接垫资金额为 ${directAmount} 元，超过200万元。`, 'DIG 绝对禁止；AIS 业务按专项决议核验。', ['directFinancingAmount']));
  }
  if (bg === 'SCG' && financing && directAmount !== undefined && directAmount > 2_000_000 && !bool(answers.isScgAllInOneMachine)) {
    findings.push(newFinding('SCG_DIRECT_FINANCING_OVER_200', 'SCG 大额直接垫资', true, 'blocking', `直接垫资金额为 ${directAmount} 元，超过200万元。`, 'SCG 绝对禁止；自有软硬件一体机例外需保留依据。', ['directFinancingAmount']));
  }
  if (financing && directAmount !== undefined && months !== undefined) {
    if (bg === 'DIG' && directAmount <= 2_000_000) {
      findings.push(newFinding('DIG_SMALL_DIRECT_FINANCING', 'DIG 小额直接垫资', true, 'high', `直接垫资金额为 ${directAmount} 元。`, 'DIG 200万元以内原则禁止，应升级审批。', ['directFinancingAmount', 'directFinancingMonths']));
    }
    if ((bg === 'TSG' || bg === 'SCG') && ((directAmount > 500_000 && directAmount <= 2_000_000) || (directAmount <= 500_000 && months > 3))) {
      findings.push(newFinding(`${bg}_SMALL_DIRECT_FINANCING`, `${bg} 小额直接垫资`, true, 'high', `直接垫资金额 ${directAmount} 元、期限 ${months} 个月，落入原则禁止区间。`, '原则上不允许签署，应升级 OT 一事一议。', ['directFinancingAmount', 'directFinancingMonths']));
    }
  }
  if (bg === 'DIG' && bool(answers.isAisBusiness) && financing && activeRule('DIG_AIS_FINANCING')) {
    findings.push(newMissing('DIG_AIS_FINANCING', 'AIS 垫资业务', ['aisFinancingDecision'], 'high'));
  }

  if (procurement === true && procurementAmount === undefined) {
    findings.push(newMissing(`${bg}_SMALL_PURE_PROCUREMENT`, '纯外采代理', ['externalProcurementAmount'], 'high'));
  } else if (procurement === true && procurementAmount !== undefined) {
    const absolute = bg === 'TSG' ? 5_000_000 : 3_000_000;
    const principle = bg === 'TSG' ? 2_000_000 : 1_000_000;
    const absoluteRuleId = bg === 'TSG' ? 'TSG_PURE_PROCUREMENT_OVER_500' : `${bg}_PURE_PROCUREMENT_OVER_300`;
    if (procurementAmount > absolute) findings.push(newFinding(absoluteRuleId, '大额纯外采代理', true, 'blocking', `分包总金额为 ${procurementAmount} 元，超过 ${absolute / 10_000} 万元阈值。`, '该 BG 规则为绝对禁止。', ['externalProcurementAmount']));
    else if (procurementAmount > principle) findings.push(newFinding(`${bg}_SMALL_PURE_PROCUREMENT`, '纯外采代理', true, 'high', `分包总金额为 ${procurementAmount} 元，落入原则禁止区间。`, '原则上不允许签署，应升级 OT 一事一议。', ['externalProcurementAmount']));
  }

  if (rating.canonical === 'D' && prepayment === undefined) findings.push(newMissing(`${bg}_CUSTOMER_D`, 'D级客户资信', ['prepaymentPercent'], 'high'));
  else if (rating.canonical === 'D' && prepayment !== undefined && prepayment < 100 && !(whitelistValue && (bg === 'DIG' || bg === 'SCG'))) {
    findings.push(newFinding(`${bg}_CUSTOMER_D`, 'D级客户资信', true, 'high', `客户为 D 级，预付款比例为 ${prepayment}%，不足100%。`, 'D级客户预付款不足100%时原则禁止，应升级审批。', ['customerRating', 'prepaymentPercent']));
  }

  if (chain === undefined) findings.push(newMissing(`${bg}_LONG_CHAIN`, '签约链条', ['chainLevel'], 'high'));
  else if ((bg === 'TSG' && chain >= 3) || ((bg === 'DIG' || bg === 'SCG') && chain >= (whitelistValue ? 4 : 3))) {
    findings.push(newFinding(`${bg}_LONG_CHAIN`, '签约链条层级', true, 'high', `我司当前处于第 ${chain + 1} 层或更下级签约角色。`, '签约链条过长，原则上不允许签署，应升级 OT 一事一议。', ['chainLevel', 'isQualityWhitelistCustomer']));
  }
  if (bg === 'TSG' && numeric(answers.nonOperatorCount) !== undefined && Number(answers.nonOperatorCount) > 1) {
    findings.push(newFinding('TSG_LONG_CHAIN', '签约链条中的非运营商客户', true, 'high', '链条中存在多家非运营商客户。', 'TSG 规则不允许多家非运营商参与链条。', ['nonOperatorCount']));
  }

  if ((bg === 'DIG' || bg === 'SCG') && bool(answers.isBackToBackPayment) === undefined) findings.push(newMissing(`${bg}_BACK_TO_BACK`, '付款方式', ['isBackToBackPayment'], 'high'));
  else if ((bg === 'DIG' || bg === 'SCG') && bool(answers.isBackToBackPayment) === true && !whitelistValue) {
    if (prepayment === undefined) findings.push(newMissing(`${bg}_BACK_TO_BACK`, '付款方式', ['prepaymentPercent'], 'high'));
    else {
      const required = REQUIRED_PREPAYMENT[rating.canonical ?? ''] ?? 100;
      if (!rating.canonical || prepayment < required) findings.push(newFinding(`${bg}_BACK_TO_BACK`, '非白名单背靠背付款', true, 'high', `非白名单客户背靠背付款，当前预付款 ${prepayment}%，低于 ${rating.canonical ? `${rating.canonical}级要求 ${required}%` : '已知评级要求'}。`, '原则上不允许签署，需补足预付款或升级审批。', ['isBackToBackPayment', 'prepaymentPercent', 'customerRating']));
    }
  }
  if (bg === 'TSG' && bool(answers.hasNonMainBusiness) === true && bool(answers.isBackToBackPayment) === true && !whitelistValue) {
    findings.push(newFinding('TSG_NON_MAIN_BACK_TO_BACK', '非主业背靠背付款', true, 'high', '非主业项目采用背靠背付款。', 'TSG 原则禁止运营商借船出海背靠背项目。', ['hasNonMainBusiness', 'isBackToBackPayment']));
  }

  if ((bg === 'DIG' || bg === 'SCG') && numeric(answers.gm1) !== undefined && Number(answers.gm1) <= 5) {
    findings.push(newFinding(`${bg}_LOW_MARGIN`, '低利润及亏损项目', true, 'high', `项目 GM1 为 ${answers.gm1}%，小于或等于5%。`, '该 BG 规则为原则禁止，应说明利润弥补和后续商机。', ['gm1']));
  }
  const supplierRisk = typeof answers.supplierHighRiskStatus === 'string' ? answers.supplierHighRiskStatus.trim().toLowerCase() : '';
  if (procurement === true) {
    if (!supplierRisk && configuredRule(`${bg}_SUPPLIER_HIGH_RISK`)?.status === 'manual_confirmation') findings.push(newMissing(`${bg}_SUPPLIER_HIGH_RISK`, '供应商高风险', ['supplierHighRiskStatus'], 'high'));
    else if (supplierRisk.includes('高') || supplierRisk.includes('high')) findings.push(newFinding(`${bg}_SUPPLIER_HIGH_RISK`, '供应商高风险', true, 'high', '后台部门已将供应商标记为高风险。', '原则上不允许签署，以商务部/采购部正式意见为准。', ['supplierHighRiskStatus']));
  }

  for (const configuredFinding of evaluateCustomConfiguredRules(answers, bg)) {
    const existingIndex = findings.findIndex((finding) => finding.ruleId === configuredFinding.ruleId);
    if (existingIndex >= 0) findings[existingIndex] = configuredFinding;
    else findings.push(configuredFinding);
  }

  const applicableRuleIds = new Set(getRuntimeRiskConfiguration().rules
    .filter((rule) => rule.status !== 'disabled' && (rule.scope === 'COMPANY' || rule.scope === bg))
    .map((rule) => rule.id));
  const applicableFindings = findings.filter((item) => applicableRuleIds.has(item.ruleId));
  if (applicableFindings.length === 0) {
    applicableFindings.push(newFinding('BG_RULES_CLEAR', 'BG 差异化管控', false, 'medium', '当前已填写证据未命中已配置的绝对禁止或原则禁止规则。', '仍需人工核验附件、合同条款和承诺措施。'));
  }
  return applicableFindings;
}

export function evaluateRisks(answers: Answers, options: { templateVersion?: string } = {}): RiskFinding[] {
  if (options.templateVersion === '2026-08') return evaluateRisks2026(answers);
  const findings = [
    evaluateCustomerCredit(answers),
    evaluateContractChain(answers),
    evaluatePaymentTerms(answers),
    evaluateProjectMargin(answers),
  ];

  if (answers.hasProcurement !== false) {
    findings.push(
      evaluatePureProcurement(answers),
      evaluateSupplierCredit(answers),
      evaluateProcurementPayment(answers),
      evaluateSubcontracting(answers),
    );
  }

  return findings;
}
