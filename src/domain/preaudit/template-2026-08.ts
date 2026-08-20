import type {
  ConditionDefinition,
  FieldType,
  FixedTemplateDefinition,
  TemplateFieldDefinition,
} from './types';

const procurementCondition: ConditionDefinition = { field: 'hasProcurement', equals: true };
const financingCondition: ConditionDefinition = { field: 'hasFinancing', equals: true };

const GUIDANCE = {
  project: '按事业部实际情况填写，信息应能支撑后台复核和 OT 汇报。',
  customer: '客户评级、回款健康度和黑白名单由后台结合发布清单核验，销售只需提供客户全称和链条信息。',
  chain: '请说明最终用户、总集、各级分包商、我司签约方及当前签约进展。',
  payment: '请说明预付款比例、付款节点、账期、是否背靠背以及资金是否已落实。',
  procurement: '如涉及采购，请说明外采比例、采购金额、供应商和净额法/总额法判断依据。',
  control: '按每一个已命中的风险点逐项填写措施、责任人和完成时间。',
} as const;

function field(
  key: string,
  label: string,
  section: string,
  type: FieldType,
  required: boolean,
  question: string,
  requiredWhen?: ConditionDefinition,
  guidance?: string,
): TemplateFieldDefinition {
  return { key, label, section, type, required, question, requiredWhen, guidance, targetCells: [] };
}

/**
 * 2026-08 发布的云文档模板。它刻意不绑定 Excel 单元格，导出时由 markdown-adapter
 * 按云文档章节重新组装，避免继续把业务填写限制在固定工作表里。
 */
export const PREAUDIT_TEMPLATE_2026_08: FixedTemplateDefinition = {
  id: 'preaudit-2026-08',
  version: '2026-08',
  name: '商机准入前置特批审批表-2026年8月云文档模板',
  token: 'preaudit202608',
  fileName: '商机准入前置特批审批表-202608发布.md',
  sheetName: '',
  format: 'markdown',
  anchors: {},
  riskCells: {},
  fields: [
    field('salesBg', '所属 BG', 'basic', 'text', true, '所属销售 BG 是什么？', undefined, '必须从当前组织配置中选择。'),
    field('salesBu', '销售 BU', 'basic', 'text', true, '销售 BU 是什么？'),
    field('contractName', '项目名称', 'basic', 'text', true, '项目名称是什么？'),
    field('triggeredControlPoints', '触碰管控点', 'basic', 'text', true, '项目触碰了哪些管控点？', undefined, GUIDANCE.control),
    field('customerName', '签约客户全称', 'basic', 'text', true, '签约客户全称是什么？', undefined, GUIDANCE.customer),
    field('customerRating', '签约客户信用评级', 'risk', 'rating', true, '签约客户信用评级是什么？', undefined, GUIDANCE.customer),
    field('customerCollectionHealth', '签约客户回款健康度', 'risk', 'number', true, '签约客户回款健康度是几级？', undefined, GUIDANCE.customer),
    field('endUserName', '最终用户全称', 'basic', 'text', true, '最终用户全称是什么？', undefined, GUIDANCE.customer),
    field('endUserRating', '最终用户信用评级', 'risk', 'rating', false, '最终用户信用评级是什么？', undefined, GUIDANCE.customer),
    field('supplierName', '供应商全称', 'procurement', 'text', false, '供应商全称是什么？', procurementCondition),
    field('supplierRating', '供应商评级', 'risk', 'rating', false, '供应商评级是什么？', procurementCondition, GUIDANCE.procurement),
    field('contractAmountCny', '合同总额（CNY）', 'basic', 'amount', true, '合同总额是多少人民币？'),
    field('gm1', '合同利润率（GM1）', 'risk', 'percentage', true, '项目 GM1 利润率是多少？'),
    field('divisionCommitment', '事业部承诺', 'commitment', 'text', true, '事业部对本项目承诺什么事项？', undefined, GUIDANCE.control),
    field('salesRegion', '销售区域', 'basic', 'text', true, '销售区域是什么？'),
    field('salesManager', '销售经理', 'basic', 'text', true, '销售经理姓名是什么？'),

    field('isEmptyTurnoverContract', '是否空转合同', 'risk', 'boolean', true, '项目是否存在无真实货物流转和商业需求的空转合同？'),
    field('isFinancingTradeContract', '是否融资性贸易/融资担保合同', 'risk', 'boolean', true, '项目是否实质属于融资性贸易或融资担保？'),
    field('hasNonMainBusiness', '是否非本 BG 主业业务', 'risk', 'boolean', true, '项目是否属于当前 BG 非主业业务？'),
    field('hasProcurement', '是否涉及采购', 'risk', 'boolean', true, '项目是否涉及采购？'),
    field('isPureProcurement', '是否纯外采代理业务', 'risk', 'boolean', false, '项目是否已被判定为净额法计收的纯外采代理业务？', procurementCondition),
    field('externalProcurementAmount', '外采/分包总金额', 'risk', 'amount', false, '外采或分包总金额是多少？', procurementCondition, GUIDANCE.procurement),
    field('externalProcurementPercent', '外采成本占比', 'risk', 'percentage', false, '外采成本占总成本的比例是多少？', procurementCondition, GUIDANCE.procurement),
    field('isAisBusiness', '是否 AIS 业务', 'risk', 'boolean', false, '项目是否属于 AIS 业务？', procurementCondition),
    field('aisFinancingDecision', 'AIS 垫资管理意见', 'risk', 'text', false, '请提供 AIS 垫资业务对应的公司决议或管理意见。', procurementCondition, 'AIS 垫资没有统一金额阈值，必须录入公司决议或管理意见。'),
    field('isScgAllInOneMachine', '是否 SCG 自有软硬件一体机', 'risk', 'boolean', false, '项目是否属于 SCG 自有软硬件一体机例外？', procurementCondition),
    field('is5gPrivateNetwork', '是否 5G 专网项目', 'risk', 'boolean', false, '项目是否属于 5G 专网项目？'),
    field('hasDirectFinancing', '是否直接垫资', 'risk', 'boolean', true, '项目是否存在直接垫资？'),
    field('directFinancingAmount', '直接垫资金额', 'risk', 'amount', false, '直接垫资金额是多少？', financingCondition),
    field('directFinancingMonths', '直接垫资期限（月）', 'risk', 'number', false, '直接垫资期限是多少个月？', financingCondition),
    field('hasPotentialFinancing', '是否潜在垫资', 'risk', 'boolean', false, '项目是否存在因账期、里程碑或背靠背条款可能形成的潜在垫资？'),
    field('potentialFinancingAmount', '潜在垫资金额', 'risk', 'amount', false, '潜在垫资金额是多少？'),
    field('chainLevel', '我司签约链条层级', 'risk', 'text', true, '我司在最终用户到签约客户的链条中处于哪一层？', undefined, GUIDANCE.chain),
    field('nonOperatorCount', '链条中非运营商客户数量', 'risk', 'number', false, '签约链条中有几家非运营商客户？', undefined, GUIDANCE.chain),
    field('upstreamSigned', '上游是否已签约', 'risk', 'boolean', true, '上游合同是否已经签署？', undefined, GUIDANCE.chain),
    field('fundingPartyConfirmed', '资金方是否明确', 'risk', 'boolean', true, '项目资金方是否已经明确并落实？', undefined, GUIDANCE.payment),
    field('isBackToBackPayment', '是否背靠背付款', 'risk', 'boolean', true, '付款条款是否背靠背？', undefined, GUIDANCE.payment),
    field('prepaymentPercent', '预付款比例', 'risk', 'percentage', true, '客户预付款比例是多少？', undefined, GUIDANCE.payment),
    field('supplierHighRiskStatus', '供应商高风险状态', 'risk', 'text', false, '商务部/采购部是否认定供应商为高风险？', procurementCondition, '该项以商务部（TSG/DIG）或采购部（SCG）意见为准，系统不擅自推断。'),
    field('isQualityWhitelistCustomer', '是否白名单客户', 'risk', 'boolean', false, '客户是否命中当前白名单？', undefined, GUIDANCE.customer),
    field('customerBlacklistMatch', '是否黑名单客户', 'risk', 'boolean', false, '客户是否命中当前 E 级黑名单清单？', undefined, GUIDANCE.customer),
    field('hasChannelFee', '是否涉及销售渠道费用', 'risk', 'boolean', false, '项目是否涉及销售渠道费用？'),

    field('opportunitySource', '商机来源', 'project', 'text', true, '商机来源是什么？', undefined, GUIDANCE.project),
    field('projectBackground', '项目背景及政策', 'project', 'text', true, '请说明项目背景及相关政策。', undefined, GUIDANCE.project),
    field('contractChainProgress', '签约链条及签约进展', 'project', 'text', true, '请说明签约链条及当前进展。', undefined, GUIDANCE.chain),
    field('fundingStatus', '资金方及资金来源与落实情况', 'project', 'text', true, '请说明资金方、资金来源和落实情况。', undefined, GUIDANCE.payment),
    field('commercialTerms', '重要商务条款', 'project', 'text', true, '请说明提供内容、付款、验收和交付条款。', undefined, GUIDANCE.payment),
    field('amountMarginRecognition', '项目金额、利润及收入确认方法', 'project', 'text', true, '请说明金额、利润和收入确认方法。'),
    field('procurementOverview', '采购类型、内容、原因及预算', 'procurement', 'text', false, '如涉及采购，请说明采购类型、内容、原因和预算。', procurementCondition, GUIDANCE.procurement),
    field('supplierOverview', '供应商情况说明', 'procurement', 'text', false, '如涉及采购，请说明供应商情况。', procurementCondition, GUIDANCE.procurement),
    field('procurementTerms', '采购形式及重要商务条款', 'procurement', 'text', false, '如涉及采购，请说明采购形式及商务条款。', procurementCondition, GUIDANCE.procurement),
    field('financingOverview', '垫资情况说明', 'procurement', 'text', false, '如涉及垫资，请说明金额、期限、原因及付款安排。', financingCondition, GUIDANCE.payment),

    field('strategicAlignment', '战略契合度', 'significance', 'text', true, '项目与公司战略如何契合？'),
    field('productCapability', '公司产品能力', 'significance', 'text', true, '项目如何体现或拓展公司产品能力？'),
    field('projectContinuity', '项目延续性', 'significance', 'text', true, '项目是否会带来延续性机会？'),
    field('historicalCooperation', '历史合作情况', 'project', 'text', false, '如涉及历史合作，请说明应收、承诺达成等情况。'),
    field('contractRiskControl', '签约风险及管控措施', 'control', 'text', true, '请逐项填写签约风险及管控措施。', undefined, GUIDANCE.control),
    field('deliveryRiskControl', '交付风险及管控措施', 'control', 'text', true, '请逐项填写交付风险及管控措施。', undefined, GUIDANCE.control),
    field('collectionRiskControl', '回款风险及管控措施', 'control', 'text', true, '请逐项填写回款风险及管控措施。', undefined, GUIDANCE.control),
    field('otherRiskControl', '其他风险类别及管控措施', 'control', 'text', false, '如有其他风险，请补充风险和措施。'),
    field('collectionCommitment', '回款承诺', 'commitment', 'text', false, '请填写回款时间承诺。'),
    field('deliveryCommitment', '交付承诺', 'commitment', 'text', false, '请填写交付质量和时间承诺。'),
    field('marginCommitment', '利润承诺', 'commitment', 'text', false, '请填写利润达标承诺。'),
    field('supplierCommitment', '供应商承诺', 'commitment', 'text', false, '请填写供应商付款及风控条款落实承诺。', procurementCondition),
    field('newOpportunityCommitment', '新商机承诺', 'commitment', 'text', true, '请说明新商机目标、预计形成时间、责任人和跟进措施；如当前确实没有，请明确填写“暂无新商机承诺”。'),
    field('otherCommitment', '其他承诺', 'commitment', 'text', false, '请填写其他承诺。'),
  ],
};
