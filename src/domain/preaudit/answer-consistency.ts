import type { FieldValue, PreauditProject } from './types';

export type ConsistencyStage = 1 | 2;

export interface AnswerConsistencyIssue {
  id: string;
  stage: ConsistencyStage;
  title: string;
  fields: string[];
  message: string;
  question: string;
}

type AnswerValues = Record<string, FieldValue | undefined>;

function text(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinedText(values: AnswerValues, keys: string[]): string {
  return keys.map((key) => text(values[key])).filter(Boolean).join('；');
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

const positiveBackToBack = [
  /背靠背/, /收到(?:上游|最终用户).*?(?:款|回款|付款)/, /以上游.*?(?:回款|到账).*为付款前提/,
];
const negativeBackToBack = [/非背靠背/, /不(?:采用|是|涉及)背靠背/, /无需背靠背/];
const positiveFunding = [/资金(?:来源|方)?.{0,12}(?:已落实|已明确|已到位|已锁定)/, /预算.{0,8}(?:已落实|已批复)/];
const negativeFunding = [/(?:资金|资金方|预算).{0,12}(?:未落实|未明确|未到位|待落实|待明确)/];
const finalUserFunding = [
  /(?:资金来源|资金方).{0,16}最终用户/,
  /最终用户.{0,20}(?:资金|预算|出具|落实|拨付)/,
];
const positiveDirectFinancing = [/(?:直接|我方|我司).{0,8}垫资/, /先(?:行)?支付.{0,8}(?:采购款|供应商款)/];
const negativeDirectFinancing = [/无(?:直接)?垫资/, /不(?:存在|涉及)(?:直接)?垫资/, /没有(?:直接)?垫资/];
const positivePotentialFinancing = [/(?:可能|潜在|形成|构成).{0,8}垫资/, /账期.{0,8}(?:导致|形成)/];
const negativePotentialFinancing = [/无(?:潜在)?垫资/, /不(?:存在|涉及)(?:潜在)?垫资/, /没有(?:潜在)?垫资/];
const positiveProcurement = [/(?:涉及|包含|需要|采购|外采|供应商|分包)/];
const negativeProcurement = [/不(?:涉及|包含|需要)采购/, /无采购/, /没有采购/];
const positivePrepayment = [
  /(?:预付款|预付)(?:比例)?(?:为|是|占|：|:)?\s*(?:\d+(?:\.\d+)?\s*[%％]|百分之[一二三四五六七八九十百零两\d]+)/,
  /(?:\d+(?:\.\d+)?\s*[%％]|百分之[一二三四五六七八九十百零两\d]+)\s*(?:的)?(?:预付款|预付)/,
];
const negativePrepayment = [/(?:无|没有|不含|不设)预付款/];
const subcontracting = [/(?:分包|下游|上游|总集|一级|二级|三级|四级)/];

function issue(
  id: string,
  stage: ConsistencyStage,
  title: string,
  fields: string[],
  message: string,
  question: string,
): AnswerConsistencyIssue {
  return { id, stage, title, fields, message, question };
}

/**
 * Finds contradictions between normalized answers and the narrative answers
 * that explain them. These checks deliberately stop short of inferring a
 * business risk: they only ask the salesperson to resolve incompatible facts.
 */
export function findAnswerConsistencyIssues(project: Pick<PreauditProject, 'answers'>): AnswerConsistencyIssue[] {
  const values = Object.fromEntries(
    Object.entries(project.answers).map(([key, answer]) => [key, answer.value]),
  ) as AnswerValues;
  const issues: AnswerConsistencyIssue[] = [];
  const commercialTerms = joinedText(values, ['commercialTerms', 'fundingStatus']);
  const financingText = joinedText(values, ['financingOverview', 'commercialTerms']);
  const procurementText = joinedText(values, ['procurementOverview', 'supplierOverview', 'procurementTerms']);
  const chainText = joinedText(values, ['contractChainProgress', 'commercialTerms']);

  const backToBackText = hasAny(commercialTerms, positiveBackToBack);
  const explicitlyNotBackToBack = hasAny(commercialTerms, negativeBackToBack);
  const fundingByFinalUser = hasAny(text(values.fundingStatus), finalUserFunding);
  if (values.isBackToBackPayment === false && fundingByFinalUser) {
    issues.push(issue(
      'FINAL_USER_FUNDING_PAYMENT_CONFLICT',
      1,
      '最终用户资金与付款方式不一致',
      ['fundingStatus', 'fundingPartyConfirmed', 'isBackToBackPayment', 'commercialTerms'],
      '资金说明显示由最终用户出具或落实资金，但付款字段记录为非背靠背。按当前管控口径，最终用户资金需要通过付款链条落实，二者不能直接同时成立。',
      '您说明资金由最终用户出具或落实，但付款又回答为非背靠背。请确认实际是否采用背靠背付款；如果确实不是背靠背，请说明我方付款资金的直接来源和付款依据。',
    ));
  }
  if (values.isBackToBackPayment === false && backToBackText && !explicitlyNotBackToBack) {
    issues.push(issue(
      'PAYMENT_TERMS_CONFLICT',
      1,
      '付款方式前后不一致',
      ['isBackToBackPayment', 'commercialTerms'],
      '结构化字段记录为“非背靠背”，但付款说明出现了背靠背或“收到上游回款后再付款”的表述。',
      '我注意到付款字段和付款说明不一致：实际是背靠背付款、非背靠背付款，还是有特殊付款安排？请以合同约定为准说明。',
    ));
  } else if (values.isBackToBackPayment === true && explicitlyNotBackToBack) {
    issues.push(issue(
      'PAYMENT_TERMS_CONFLICT',
      1,
      '付款方式前后不一致',
      ['isBackToBackPayment', 'commercialTerms'],
      '结构化字段记录为“背靠背”，但付款说明明确写成了非背靠背。',
      '我注意到付款字段和付款说明不一致：实际是背靠背付款、非背靠背付款，还是有特殊付款安排？请以合同约定为准说明。',
    ));
  }

  const fundingConfirmedText = hasAny(text(values.fundingStatus), positiveFunding);
  const fundingUnconfirmedText = hasAny(text(values.fundingStatus), negativeFunding);
  if (values.fundingPartyConfirmed === true && fundingUnconfirmedText) {
    issues.push(issue(
      'FUNDING_STATUS_CONFLICT',
      1,
      '资金落实状态前后不一致',
      ['fundingPartyConfirmed', 'fundingStatus'],
      '结构化字段记录为资金方已明确并落实，但资金说明出现了未落实、未明确或待落实。',
      '资金方状态看起来不一致：资金是否已经明确并落实？请说明最终确认结果和依据。',
    ));
  } else if (values.fundingPartyConfirmed === false && fundingConfirmedText) {
    issues.push(issue(
      'FUNDING_STATUS_CONFLICT',
      1,
      '资金落实状态前后不一致',
      ['fundingPartyConfirmed', 'fundingStatus'],
      '结构化字段记录为资金方尚未明确或落实，但资金说明出现了已落实、已到位或预算已批复。',
      '资金方状态看起来不一致：资金是否已经明确并落实？请说明最终确认结果和依据。',
    ));
  }

  const directFinancingText = hasAny(financingText, positiveDirectFinancing);
  const noDirectFinancingText = hasAny(financingText, negativeDirectFinancing);
  if (values.hasDirectFinancing === false && directFinancingText && !noDirectFinancingText) {
    issues.push(issue(
      'DIRECT_FINANCING_CONFLICT',
      2,
      '直接垫资信息前后不一致',
      ['hasDirectFinancing', 'financingOverview', 'commercialTerms'],
      '结构化字段记录为不存在直接垫资，但说明中出现了我方先支付采购款或直接垫资的表述。',
      '我注意到直接垫资字段和说明不一致：项目是否存在我方先付款、后收款的直接垫资？金额和期限是多少？',
    ));
  } else if (values.hasDirectFinancing === true && noDirectFinancingText) {
    issues.push(issue(
      'DIRECT_FINANCING_CONFLICT',
      2,
      '直接垫资信息前后不一致',
      ['hasDirectFinancing', 'financingOverview', 'commercialTerms'],
      '结构化字段记录为存在直接垫资，但说明中又明确表示没有直接垫资。',
      '我注意到直接垫资字段和说明不一致：项目是否存在我方先付款、后收款的直接垫资？金额和期限是多少？',
    ));
  }

  const potentialFinancingText = hasAny(financingText, positivePotentialFinancing);
  const noPotentialFinancingText = hasAny(financingText, negativePotentialFinancing);
  if (values.hasPotentialFinancing === false && potentialFinancingText && !noPotentialFinancingText) {
    issues.push(issue(
      'POTENTIAL_FINANCING_CONFLICT',
      2,
      '潜在垫资信息前后不一致',
      ['hasPotentialFinancing', 'financingOverview', 'commercialTerms'],
      '结构化字段记录为不存在潜在垫资，但说明中出现了可能因账期或付款安排形成垫资的表述。',
      '请确认项目是否可能因账期、里程碑或付款安排形成潜在垫资？如果没有，请说明依据。',
    ));
  } else if (values.hasPotentialFinancing === true && noPotentialFinancingText) {
    issues.push(issue(
      'POTENTIAL_FINANCING_CONFLICT',
      2,
      '潜在垫资信息前后不一致',
      ['hasPotentialFinancing', 'financingOverview', 'commercialTerms'],
      '结构化字段记录为存在潜在垫资，但说明中又明确表示没有潜在垫资。',
      '请确认项目是否可能因账期、里程碑或付款安排形成潜在垫资？如果没有，请说明依据。',
    ));
  }

  const procurementEnabled = values.hasProcurement === true;
  const procurementDisabledText = hasAny(procurementText, negativeProcurement);
  const procurementPositiveText = hasAny(procurementText, positiveProcurement);
  if (!procurementEnabled && procurementPositiveText && !procurementDisabledText) {
    issues.push(issue(
      'PROCUREMENT_STATUS_CONFLICT',
      2,
      '采购状态前后不一致',
      ['hasProcurement', 'procurementOverview', 'supplierOverview', 'procurementTerms'],
      '结构化字段记录为不涉及采购，但采购或供应商说明中出现了采购、外采、分包或供应商信息。',
      '请确认项目是否涉及采购或外包？如果涉及，请补充采购金额、供应商和付款安排。',
    ));
  } else if (procurementEnabled && procurementDisabledText && !procurementPositiveText) {
    issues.push(issue(
      'PROCUREMENT_STATUS_CONFLICT',
      2,
      '采购状态前后不一致',
      ['hasProcurement', 'procurementOverview', 'supplierOverview', 'procurementTerms'],
      '结构化字段记录为涉及采购，但说明中又明确表示不涉及采购。',
      '请确认项目是否涉及采购或外包？如果涉及，请补充采购金额、供应商和付款安排。',
    ));
  }

  const prepayment = values.prepaymentPercent;
  const prepaymentText = joinedText(values, ['commercialTerms']);
  if (typeof prepayment === 'number' && prepayment > 0 && hasAny(prepaymentText, negativePrepayment)) {
    issues.push(issue(
      'PREPAYMENT_CONFLICT',
      1,
      '预付款信息前后不一致',
      ['prepaymentPercent', 'commercialTerms'],
      '结构化字段记录了预付款比例，但付款说明又表示没有预付款。',
      '请确认客户预付款比例，付款说明和结构化比例以合同约定为准。',
    ));
  } else if (
    prepayment === 0
    && hasAny(prepaymentText, positivePrepayment)
    && !hasAny(prepaymentText, negativePrepayment)
  ) {
    issues.push(issue(
      'PREPAYMENT_CONFLICT',
      1,
      '预付款信息前后不一致',
      ['prepaymentPercent', 'commercialTerms'],
      '结构化字段记录为无预付款，但付款说明出现了预付款比例。',
      '请确认客户预付款比例，付款说明和结构化比例以合同约定为准。',
    ));
  }

  const chainLevel = text(values.chainLevel);
  if (chainLevel === 'direct' && hasAny(chainText, subcontracting)) {
    issues.push(issue(
      'CHAIN_LEVEL_CONFLICT',
      2,
      '签约链条层级前后不一致',
      ['chainLevel', 'contractChainProgress'],
      '结构化字段记录为直签，但签约链条说明中出现了分包、上游、下游或多级客户。',
      '请确认我方是与最终用户直签，还是处于分包链条中？请按最终用户到我方的实际层级说明。',
    ));
  } else if (chainLevel && chainLevel !== 'direct' && /直签/.test(chainText) && !/非直签/.test(chainText)) {
    issues.push(issue(
      'CHAIN_LEVEL_CONFLICT',
      2,
      '签约链条层级前后不一致',
      ['chainLevel', 'contractChainProgress'],
      '结构化字段记录为分包，但签约链条说明中又出现了直签表述。',
      '请确认我方是与最终用户直签，还是处于分包链条中？请按最终用户到我方的实际层级说明。',
    ));
  }

  return issues;
}
