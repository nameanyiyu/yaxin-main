import type { PreauditProject } from './types';
import type { PreauditService } from './service';

export interface FallbackExtractionResult {
  values: Record<string, string | number | boolean>;
  riskAssessments: Array<{
    ruleId: string;
    result: 'triggered' | 'clear';
    confidence: number;
    reason: string;
    evidenceKeys: string[];
  }>;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function explicitBoolean(text: string, positive: RegExp[], negative: RegExp[]): boolean | undefined {
  if (hasAny(text, negative)) return false;
  if (hasAny(text, positive)) return true;
  return undefined;
}

function narrative(text: string, patterns: RegExp[]): string | undefined {
  return hasAny(text, patterns) ? text.trim() : undefined;
}

function matchingSentences(text: string, patterns: RegExp[]): string {
  const sentences = text.split(/[。！？；;\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const selected = sentences.filter((sentence) => hasAny(sentence, patterns));
  return (selected.length ? selected : [text.trim()]).join('；');
}

export function normalizeCommitmentValue(key: string, value: string): string {
  const patterns: Record<string, RegExp[]> = {
    collectionCommitment: [/回款承诺/, /首笔回款/, /全部回款/, /回款目标/],
    marginCommitment: [/利润承诺/, /守住GM1/, /GM1.*承诺/, /利润目标/],
    deliveryCommitment: [/交付承诺/, /交付.*验收/, /验收.*交付/, /上线承诺/],
    supplierCommitment: [/供应商承诺/, /供应商.*付款/, /禁止.*二次分包/, /禁止.*转包/],
    newOpportunityCommitment: [/新商机承诺/, /后续商机.*承诺/, /衍生(?:新)?项目/, /暂无新商机/],
  };
  const selectedPatterns = patterns[key];
  return selectedPatterns ? matchingSentences(value, selectedPatterns) : value;
}

export function fallbackSalesClarification(content: string): string | undefined {
  const text = content.trim();
  if (/什么是空转(?:项目|合同)?|空转(?:项目|合同)?是什么意思/.test(text)) {
    return '空转合同通常指缺少真实业务需求或真实货物流转，主要通过形式上的合同、发票或资金流转完成交易，项目本身没有可核验的实际建设、交付或商业价值。请结合本项目的真实交付内容和业务需求回答是否属于空转。';
  }
  if (/什么是融资性贸易|融资担保是什么意思|什么叫融资性贸易/.test(text)) {
    return '融资性贸易或融资担保通常指表面上是买卖或服务合同，实质主要承担资金出借、融资担保或变相垫资功能，而不是以真实业务交付为目的。请按合同实际资金和交付安排说明是否存在该情形。';
  }
  if (/什么是背靠背|背靠背付款是什么意思/.test(text)) {
    return '背靠背付款是指我方付款或回款安排以客户、上游或其他第三方先付款为前提，付款责任与上游回款绑定。请以合同中的实际付款条件为准说明是否属于背靠背。';
  }
  return undefined;
}

/**
 * A deliberately conservative extractor for the most common short answers.
 * It is only a continuity safety net when the LLM stream is unavailable; it
 * never guesses ratings, blacklist status, supplier risk, dates, owners or
 * amounts that are not explicitly stated.
 */
export function extractFallbackSalesAnswers(project: Pick<PreauditProject, 'answers'>, content: string): FallbackExtractionResult {
  const text = content.trim();
  const values: FallbackExtractionResult['values'] = {};
  const riskAssessments: FallbackExtractionResult['riskAssessments'] = [];

  const isEmptyTurnoverContract = explicitBoolean(
    text,
    [/是(?:个)?空转(?:项目|合同)?/, /属于空转/],
    [/不是空转/, /不存在空转/, /有真实(?:业务|商业需求|交付)/],
  );
  if (isEmptyTurnoverContract !== undefined) {
    values.isEmptyTurnoverContract = isEmptyTurnoverContract;
    riskAssessments.push({
      ruleId: 'COMPANY_EMPTY_TURNOVER', result: isEmptyTurnoverContract ? 'triggered' : 'clear', confidence: 0.82,
      reason: isEmptyTurnoverContract ? '销售明确表示项目属于空转合同。' : '销售明确否认空转合同，并说明项目具有真实业务或交付。',
      evidenceKeys: ['isEmptyTurnoverContract'],
    });
  }

  const isFinancingTradeContract = explicitBoolean(
    text,
    [/是融资性贸易/, /属于融资(?:性贸易|担保)/, /融资担保合同/],
    [/不是融资(?:性贸易|的)?(?:贸易|担保)?/, /不属于融资(?:性贸易|担保)/, /没有融资(?:性贸易|担保)/],
  );
  if (isFinancingTradeContract !== undefined) {
    values.isFinancingTradeContract = isFinancingTradeContract;
    riskAssessments.push({
      ruleId: 'COMPANY_FINANCING_TRADE', result: isFinancingTradeContract ? 'triggered' : 'clear', confidence: 0.82,
      reason: isFinancingTradeContract ? '销售明确表示项目属于融资性贸易或融资担保。' : '销售明确否认融资性贸易或融资担保。',
      evidenceKeys: ['isFinancingTradeContract'],
    });
  }

  const hasNonMainBusiness = explicitBoolean(
    text,
    [/属于非本\s*BG\s*主业/, /属于非本BG业务/, /不是运营商业务/],
    [/不是非本\s*BG\s*主业/, /不属于非本\s*BG\s*主业/, /属于本\s*BG\s*主业/, /属于运营商业务/],
  );
  if (hasNonMainBusiness !== undefined) {
    values.hasNonMainBusiness = hasNonMainBusiness;
    const bg = typeof project.answers.salesBg?.value === 'string' ? project.answers.salesBg.value.toUpperCase() : '';
    if (bg === 'TSG') {
      riskAssessments.push({
        ruleId: 'TSG_NON_MAIN_BUSINESS', result: hasNonMainBusiness ? 'triggered' : 'clear', confidence: 0.82,
        reason: hasNonMainBusiness ? '销售明确表示项目属于非本 BG 主业。' : '销售明确表示项目属于运营商业务或本 BG 主业。',
        evidenceKeys: ['hasNonMainBusiness'],
      });
    }
  }

  const prepaymentMatch = text.match(/(?:预付款|预付(?:款|比例)?)[^。；;\n]{0,16}(?:为|是|占|：|:)\s*(\d+(?:\.\d+)?)\s*[%％]/i)
    ?? text.match(/(\d+(?:\.\d+)?)\s*[%％][^。；;\n]{0,12}(?:预付款|预付)/i);
  if (prepaymentMatch) values.prepaymentPercent = Number(prepaymentMatch[1]);
  else if (hasAny(text, [/无预付款/, /没有预付款/, /没有预付/, /预付款(?:比例)?没有/, /预付比例(?:为)?零/])) values.prepaymentPercent = 0;

  const isBackToBackPayment = explicitBoolean(text, [/采用背靠背/, /是背靠背/, /背靠背付款/], [/不背靠背/, /非背靠背/, /不是背靠背/, /不采用背靠背/]);
  if (isBackToBackPayment !== undefined) values.isBackToBackPayment = isBackToBackPayment;

  const hasProcurement = explicitBoolean(text, [/涉及采购/, /有采购/, /需要采购/, /外采|外包|分包/], [/不涉及采购/, /没有采购/, /无采购/, /不需要采购/]);
  if (hasProcurement !== undefined) values.hasProcurement = hasProcurement;

  const hasDirectFinancing = explicitBoolean(text, [/存在直接垫资/, /有直接垫资/, /需要直接垫资/], [/没有直接垫资/, /无直接垫资/, /不涉及直接垫资/]);
  if (hasDirectFinancing !== undefined) values.hasDirectFinancing = hasDirectFinancing;

  const hasPotentialFinancing = explicitBoolean(text, [/存在潜在垫资/, /有潜在垫资/], [/没有潜在垫资/, /无潜在垫资/, /不存在潜在垫资/, /没有直接垫资[^。；;\n]{0,8}潜在垫资/]);
  if (hasPotentialFinancing !== undefined) values.hasPotentialFinancing = hasPotentialFinancing;

  if (hasAny(text, [/客户直签/, /直接签约/, /我司直签/])) values.chainLevel = 'direct';
  else if (hasAny(text, [/一级分包/, /一层分包/])) values.chainLevel = 'first_subcontractor';
  else if (hasAny(text, [/二级分包/, /多级分包/, /下级分包/])) values.chainLevel = 'downstream_subcontractor';

  const strategicAlignment = narrative(text, [/战略价值/, /战略意义/, /为公司提供.*机会/, /战略上/]);
  const productCapability = narrative(text, [/产品能力/, /产品沉淀/, /能力沉淀/]);
  const projectContinuity = narrative(text, [/后续.*合作/, /继续合作/, /二期/, /三期/, /延续机会/, /复制机会/]);
  const historicalCooperation = narrative(text, [/历史合作/, /历来/, /之前.*合作/, /过去.*合作/]);
  if (strategicAlignment) values.strategicAlignment = strategicAlignment;
  if (productCapability) values.productCapability = productCapability;
  if (projectContinuity) values.projectContinuity = projectContinuity;
  if (historicalCooperation) values.historicalCooperation = historicalCooperation;

  if (hasAny(text, [/回款承诺/, /首笔回款/, /全部回款/, /回款目标/])) values.collectionCommitment = normalizeCommitmentValue('collectionCommitment', text);
  if (hasAny(text, [/利润承诺/, /守住GM1/, /GM1.*承诺/, /利润目标/])) values.marginCommitment = normalizeCommitmentValue('marginCommitment', text);
  if (hasAny(text, [/交付承诺/, /交付.*验收/, /验收.*交付/, /上线承诺/])) values.deliveryCommitment = normalizeCommitmentValue('deliveryCommitment', text);
  if (hasAny(text, [/供应商承诺/, /供应商.*付款/, /禁止.*二次分包/, /禁止.*转包/])) values.supplierCommitment = normalizeCommitmentValue('supplierCommitment', text);
  if (hasAny(text, [/新商机承诺/, /后续商机.*承诺/, /衍生(?:新)?项目/, /暂无新商机/])) values.newOpportunityCommitment = normalizeCommitmentValue('newOpportunityCommitment', text);

  if (hasAny(text, [/签约风险/, /合同风险/, /签约措施/]) || hasAny(text, [/无新增风险/]) && hasAny(text, [/签约/])) values.contractRiskControl = matchingSentences(text, [/签约风险/, /合同风险/, /签约措施/, /无新增风险/]);
  if (hasAny(text, [/交付风险/, /交付措施/]) || hasAny(text, [/无新增风险/]) && hasAny(text, [/交付/])) values.deliveryRiskControl = matchingSentences(text, [/交付风险/, /交付措施/, /无新增风险/]);
  if (hasAny(text, [/回款风险/, /回款措施/]) || hasAny(text, [/无新增风险/]) && hasAny(text, [/回款/])) values.collectionRiskControl = matchingSentences(text, [/回款风险/, /回款措施/, /无新增风险/]);
  if (hasAny(text, [/其他风险/, /其他措施/])) values.otherRiskControl = matchingSentences(text, [/其他风险/, /其他措施/]);
  if (hasAny(text, [/无新增风险/, /没有新增风险/]) && !Object.keys(values).some((key) => key.endsWith('RiskControl'))) {
    values.contractRiskControl = text;
    values.deliveryRiskControl = text;
    values.collectionRiskControl = text;
  }

  return { values, riskAssessments };
}

export async function applyFallbackSalesExtraction(project: PreauditProject, content: string, service: PreauditService): Promise<PreauditProject> {
  const extracted = extractFallbackSalesAnswers(project, content);
  let updated = project;
  if (Object.keys(extracted.values).length) {
    updated = await service.updateAnswers(project.id, extracted.values, 'agent', {
      confidenceByKey: Object.fromEntries(Object.keys(extracted.values).map((key) => [key, 0.72])),
      confirmationStatus: 'needs_confirmation',
    });
  }
  if (extracted.riskAssessments.length) updated = await service.updateAiRiskAssessments(project.id, extracted.riskAssessments);
  return updated;
}
