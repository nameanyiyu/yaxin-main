import { z } from 'zod';

export type RiskScope = 'COMPANY' | 'TSG' | 'DIG' | 'SCG';
export type RiskLevel = 'absolute' | 'principle' | 'approval';
export type RiskConfigStatus = 'active' | 'manual_confirmation' | 'disabled';
export type CustomerListType = 'blacklist' | 'whitelist';
export type RiskConditionOperator = 'equals' | 'not_equals' | 'contains' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte';
export type RiskConditionCompareMode = 'literal' | 'field';
export type RiskConditionSource = 'manual' | 'ai';
export type RiskConditionReviewStatus = 'pending_review' | 'approved' | 'rejected';

export interface RiskRuleConfig {
  id: string;
  name?: string;
  scope: RiskScope;
  level: RiskLevel;
  category: '业务形式' | '客户资信' | '签约链条' | '付款方式' | '项目利润' | '供应商资信' | '其他';
  riskPoint: string;
  /** 供大模型理解“什么情况下属于该风险”的业务表述。 */
  recognitionGuidance?: string;
  requirement: string;
  question: string;
  source: string;
  status: RiskConfigStatus;
  conditionField?: string;
  conditionOperator?: RiskConditionOperator;
  conditionValue?: string;
  conditionCompareMode?: RiskConditionCompareMode;
  conditionValueField?: string;
  conditionSource?: RiskConditionSource;
  conditionReviewStatus?: RiskConditionReviewStatus;
  conditionExplanation?: string;
}

export interface CustomerListEntry {
  id: string;
  type: CustomerListType;
  name: string;
  note: string;
  strategic?: boolean;
  enabled: boolean;
  creditGrade?: string;
  collectionHealth?: string;
  sourceFile?: string;
  updatedAt?: string;
}

export interface RiskConfiguration {
  version: string;
  sourceDocument: string;
  updatedAt: string;
  rules: RiskRuleConfig[];
  customerLists: CustomerListEntry[];
}

const rule = (
  id: string,
  scope: RiskScope,
  level: RiskLevel,
  category: RiskRuleConfig['category'],
  riskPoint: string,
  requirement: string,
  question: string,
  status: RiskConfigStatus = 'active',
): RiskRuleConfig => ({
  id, name: riskPoint, scope, level, category, riskPoint, recognitionGuidance: riskPoint, requirement, question,
  source: 'GL-A-006 V4.0（2026年8月）', status,
});

export const DEFAULT_RISK_RULES: RiskRuleConfig[] = [
  rule('COMPANY_EMPTY_TURNOVER', 'COMPANY', 'absolute', '业务形式', '空转合同', '无条件禁止签约，不接受特批。', '请确认项目是否存在无真实货物流转和商业需求的空转合同？'),
  rule('COMPANY_FINANCING_TRADE', 'COMPANY', 'absolute', '业务形式', '融资性贸易/融资担保合同', '无条件禁止签约，不接受特批。', '请确认项目是否实质属于融资性贸易或融资担保？'),
  rule('COMPANY_DIRECT_FINANCING_OVER_200', 'COMPANY', 'absolute', '业务形式', '直接垫资超过200万元', '直接垫资金额超过200万元绝对禁止；AIS、SCG一体机按专项规则处理。', '请确认直接垫资金额及是否属于 AIS 或 SCG 自有软硬件一体机？'),
  rule('COMPANY_CUSTOMER_BLACKLIST', 'COMPANY', 'absolute', '客户资信', 'E级黑名单/回款健康度5级-黑', '整个签约链条中客户命中 E 级黑名单或回款健康度5级-黑时禁止合作；回款健康度以 AR 管理部发布为准。', '请确认签约链条客户是否命中 E 级黑名单或回款健康度5级-黑？'),
  rule('TSG_NON_MAIN_BUSINESS', 'TSG', 'absolute', '业务形式', '非 TSG 主业业务', '不允许签署非运营商客户项目，白名单项目除外。', '请确认项目是否属于 TSG 主业以及客户是否属于白名单？'),
  rule('TSG_DIRECT_FINANCING_OVER_200', 'TSG', 'absolute', '业务形式', '大额直接垫资（不含5G专网）', '垫资金额超过200万元绝对禁止。', '请确认直接垫资金额及是否属于5G专网项目？'),
  rule('TSG_PURE_PROCUREMENT_OVER_500', 'TSG', 'absolute', '业务形式', '大额纯外采代理', '分包总金额超过500万元绝对禁止。', '请确认纯外采代理的分包总金额？'),
  rule('TSG_CUSTOMER_E_OR_HEALTH_5', 'TSG', 'absolute', '客户资信', '链条客户 E 级或回款健康度5级-黑', '整个签约链条命中 E 级黑名单或回款健康度5级-黑绝对禁止；广电项目一事一议。', '请确认整个签约链条的客户评级和回款健康度？'),
  rule('TSG_NON_MAIN_BACK_TO_BACK', 'TSG', 'principle', '付款方式', '运营商借船出海背靠背项目', '原则上不允许签署，需升级 OT 一事一议。', '请确认非主业项目是否采用背靠背付款？'),
  rule('TSG_SMALL_DIRECT_FINANCING', 'TSG', 'principle', '业务形式', '小额直接垫资', '50万-200万，或50万以内但期限超过3个月，原则禁止；50万以内且3个月以内合同审批准入。', '请确认直接垫资金额和期限？'),
  rule('TSG_SMALL_PURE_PROCUREMENT', 'TSG', 'principle', '业务形式', '小额纯外采代理', '分包总金额200万-500万原则禁止，200万以内合同审批准入。', '请确认纯外采代理分包总金额？'),
  rule('TSG_CUSTOMER_D', 'TSG', 'principle', '客户资信', 'D级客户且无预付100%', '签约客户 D 级且不满足100%预付原则禁止。', '请确认客户评级和预付款比例？'),
  rule('TSG_LONG_CHAIN', 'TSG', 'principle', '签约链条', '我司处在三级分包商以后', '原则上不允许；非运营商最多一家，运营商项目涉及非运营商不得处于四层及以后。', '请确认我司链条层级及非运营商客户数量？'),
  rule('TSG_LOSS_PROJECT', 'TSG', 'principle', '项目利润', '亏损项目', '整体亏损金额超过50万元原则禁止。', '请确认项目是否亏损以及亏损金额？'),
  rule('TSG_SUPPLIER_HIGH_RISK', 'TSG', 'principle', '供应商资信', '供应商高风险', '以公司商务部意见为准。', '请提供商务部对供应商高风险的判断。', 'manual_confirmation'),
  rule('DIG_DIRECT_FINANCING_OVER_200', 'DIG', 'absolute', '业务形式', '大额直接垫资', '直接垫资金额超过200万元绝对禁止，不包含 AIS 业务。', '请确认直接垫资金额及是否属于 AIS？'),
  rule('DIG_PURE_PROCUREMENT_OVER_300', 'DIG', 'absolute', '业务形式', '大额纯外采代理', '分包总金额超过300万元绝对禁止。', '请确认纯外采代理分包总金额？'),
  rule('DIG_CUSTOMER_E_OR_HEALTH_5', 'DIG', 'absolute', '客户资信', '链条客户 E 级或回款健康度5级-黑', '整个签约链条命中 E 级黑名单或回款健康度5级-黑绝对禁止。', '请确认整个签约链条的客户评级和回款健康度？'),
  rule('DIG_SMALL_DIRECT_FINANCING', 'DIG', 'principle', '业务形式', '小额直接垫资', '200万元以内原则禁止。', '请确认直接垫资金额？'),
  rule('DIG_AIS_FINANCING', 'DIG', 'principle', '业务形式', 'AIS垫资业务', '按照公司决议方向管理，需人工确认。', '请提供 AIS 垫资业务对应的公司决议或管理意见。', 'manual_confirmation'),
  rule('DIG_SMALL_PURE_PROCUREMENT', 'DIG', 'principle', '业务形式', '纯外采代理', '分包总金额100万-300万原则禁止，100万以内合同审批准入。', '请确认纯外采代理分包总金额？'),
  rule('DIG_CUSTOMER_D', 'DIG', 'principle', '客户资信', 'D级客户且无预付100%', 'D级客户预付款不满足100%原则禁止，白名单客户除外。', '请确认客户评级、预付款比例和白名单状态？'),
  rule('DIG_LONG_CHAIN', 'DIG', 'principle', '签约链条', '签约链条过长', '白名单客户不得处于四层及以后，非白名单客户不得处于三层及以后。', '请确认我司链条层级和客户白名单状态？'),
  rule('DIG_BACK_TO_BACK', 'DIG', 'principle', '付款方式', '非白名单背靠背付款', '非白名单客户原则禁止背靠背；预付款要求 S/A/B/C/D 为10%/20%/40%/60%/100%。', '请确认是否背靠背付款、客户评级、预付款比例和白名单状态？'),
  rule('DIG_LOW_MARGIN', 'DIG', 'principle', '项目利润', '低利润及亏损项目', 'GM1小于等于5%的合同原则禁止（含销售渠道费用成本）。', '请确认 GM1 和销售渠道费用？'),
  rule('DIG_SUPPLIER_HIGH_RISK', 'DIG', 'principle', '供应商资信', '供应商高风险', '以公司商务部意见为准。', '请提供商务部对供应商高风险的判断。', 'manual_confirmation'),
  rule('SCG_DIRECT_FINANCING_OVER_200', 'SCG', 'absolute', '业务形式', '大额直接垫资', '直接垫资金额超过200万元禁止，自有软硬件一体机除外。', '请确认直接垫资金额及是否属于自有软硬件一体机？'),
  rule('SCG_PURE_PROCUREMENT_OVER_300', 'SCG', 'absolute', '业务形式', '大额纯外采代理', '分包总金额超过300万元绝对禁止。', '请确认纯外采代理分包总金额？'),
  rule('SCG_CUSTOMER_E_OR_HEALTH_5', 'SCG', 'absolute', '客户资信', '链条客户 E 级或回款健康度5级-黑', '整个签约链条命中 E 级黑名单或回款健康度5级-黑禁止。', '请确认整个签约链条的客户评级和回款健康度？'),
  rule('SCG_SMALL_DIRECT_FINANCING', 'SCG', 'principle', '业务形式', '小额直接垫资', '50万-200万，或50万以内但期限超过3个月原则禁止；50万以内且3个月以内合同审批准入。', '请确认直接垫资金额和期限？'),
  rule('SCG_SMALL_PURE_PROCUREMENT', 'SCG', 'principle', '业务形式', '小额纯外采代理', '分包总金额100万-300万原则禁止，100万以内合同审批准入。', '请确认纯外采代理分包总金额？'),
  rule('SCG_CUSTOMER_D', 'SCG', 'principle', '客户资信', 'D级客户且预付低于100%', 'D级客户预付款不满足100%原则禁止，白名单客户除外。', '请确认客户评级、预付款比例和白名单状态？'),
  rule('SCG_LONG_CHAIN', 'SCG', 'principle', '签约链条', '签约链条过长', '白名单客户不得处于四层及以后，非白名单客户不得处于三层及以后。', '请确认我司链条层级和客户白名单状态？'),
  rule('SCG_BACK_TO_BACK', 'SCG', 'principle', '付款方式', '非白名单背靠背付款', '非白名单客户原则禁止背靠背；预付款要求 S/A/B/C/D 为10%/20%/40%/60%/100%。', '请确认是否背靠背付款、客户评级、预付款比例和白名单状态？'),
  rule('SCG_LOW_MARGIN', 'SCG', 'principle', '项目利润', '低利润及亏损项目', 'GM1小于等于5%的合同原则禁止（含销售渠道费用成本）。', '请确认 GM1 和销售渠道费用？'),
  rule('SCG_SUPPLIER_HIGH_RISK', 'SCG', 'principle', '供应商资信', '供应商高风险', '以公司采购部意见为准。', '请提供采购部对供应商高风险的判断。', 'manual_confirmation'),
];

const BLACKLIST_NAMES = [
  '北京国美大数据技术有限公司','成都农村商业银行股份有限公司','民生通讯（深圳）有限公司','深圳联想懂的通信有限公司','北京联想调频科技有限公司','中国广电甘肃网络股份有限公司','红豆电信有限公司','民生电商控股（深圳）有限公司','长城宽带网络服务有限公司','南京南瑞信息通信科技有限公司','合肥迈思泰合信息科技有限公司','中国广电云南网络有限公司','内蒙古电力(集团)有限责任公司物资供应分公司','河南广播电视网络股份有限公司','北京北明数科信息技术有限公司','北京尚优力达科技有限公司','正数网络技术有限公司','广安天玺教育咨询服务有限公司','中国广电内蒙古网络有限公司','郑州数据交易中心有限公司','中国广电黑龙江网络股份有限公司','中铁三局集团第五工程有限公司','中铁六局集团呼和浩特铁路建设有限公司','中铁二局第六工程有限公司','太原东山煤电集团有限公司','康源领鲜（山东）海洋科技股份有限公司','宽城升金矿业有限公司','康源领鲜（山东）海洋发展有限责任公司','赤峰向阳煤业有限责任公司','康源领鲜科技有限公司','天津亿阳信通科技有限公司','广安天悦教育服务有限公司','河南智慧中原信息科技有限公司','河南豫网数字科技有限公司','重庆新华书店集团公司','西安市蒲城秦家坡煤矿','深圳中赫慧能科技有限公司','中煤芒来（苏尼特左旗）矿业有限公司','姚安奥鸿农业供水有限公司','兰州亚成生物科技股份有限公司','湖北大冲格润科技有限公司','河南港田电子信息产业服务有限公司','深圳国人无线通信有限公司','南京软控电子科技有限公司','未来智慧有限公司','金碧物业有限公司','湖北省楚天视讯网络有限公司','中国广电安徽网络股份有限公司',
];

const WHITELIST_ENTRIES: Array<[string, string, boolean?]> = [
  ['移动、联通、电信、星网集团','原白名单客户',true],['广电客户','原白名单客户',false],['铁塔集团','原白名单客户',false],['阿里集团','原白名单客户',true],['华为集团','原白名单客户',false],['腾讯集团','原白名单客户',false],['浪潮集团','原白名单客户',false],['国家能源集团','原白名单客户',true],['中核集团（中国核工业集团有限公司）','原白名单客户',true],['上海南洋万邦软件技术有限公司','原白名单客户',false],['湖南高速集团','原白名单客户',false],['上海垣信卫星科技有限公司','新增，SSU申请的重点空天客户',true],['上海迪爱斯信息技术有限公司','新增，SSU申请的重点空天客户，垣信的主要供应商',true],['中国雅江集团有限公司','新增，SSU申请的重点空天客户',true],['中国科学院微小卫星创新研究院','新增，事业单位，垣信主要供应商，SSU申请为白名单',true],['上海格思航天科技有限公司','新增，事业单位，垣信主要供应商，SSU申请为白名单',true],['国家电投集团（国家电力投资集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['华电集团','新增，ESU申请白名单集团'],['华能集团（中国华能集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['大唐集团（中国大唐集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['中广核集团（中国广核集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['国投电力集团（国投电力控股股份有限公司等）','新增，ESU和DIG共同申请白名单集团'],['华润集团','新增，ESU申请白名单集团'],['中节能集团（中国节能环保集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['三峡集团（中国长江三峡集团有限公司等）','新增，ESU和DIG共同申请白名单集团'],['北京火山引擎科技有限公司','新增，DIG申请增加，系BG年度重点合作的客户'],['国家能源集团（国家能源投资集团有限责任公司等）','新增，DIG申请增加，系BG年度重点合作的客户'],['华润电力集团（华润电力控股有限公司等）','新增，DIG申请增加，系BG年度重点合作的客户'],['中石油集团（中国石油天然气集团有限公司等）','新增，DIG申请增加，系BG年度重点合作的客户'],['中石化集团（中国石油化工集团有限公司等）','新增，DIG申请增加，系BG年度重点合作的客户'],['中海油集团（中国海洋石油集团有限公司、中海油信息科技有限公司等）','新增，DIG申请增加，系BG年度重点合作的客户'],['中国汽车工程研究院股份有限公司','新增，DIG申请增加，系BG年度重点合作的客户'],['瓜子汽车服务（天津）有限公司','新增，DIG申请增加，系BG年度重点合作的客户'],
];

export const DEFAULT_CUSTOMER_LISTS: CustomerListEntry[] = [
  ...BLACKLIST_NAMES.map((name, index) => ({ id: `blacklist-${index + 1}`, type: 'blacklist' as const, name, note: '附件1：黑名单客户清单（2026年8月发布）', enabled: true, creditGrade: 'E' })),
  ...WHITELIST_ENTRIES.map(([name, note, strategic], index) => ({ id: `whitelist-${index + 1}`, type: 'whitelist' as const, name, note, strategic, enabled: true })),
];

const riskRuleSchema = z.object({
  id: z.string(), name: z.string().optional(), scope: z.enum(['COMPANY', 'TSG', 'DIG', 'SCG']), level: z.enum(['absolute', 'principle', 'approval']),
  category: z.enum(['业务形式', '客户资信', '签约链条', '付款方式', '项目利润', '供应商资信', '其他']),
  riskPoint: z.string(), recognitionGuidance: z.string().optional(), requirement: z.string(), question: z.string(), source: z.string(), status: z.enum(['active', 'manual_confirmation', 'disabled']),
  conditionField: z.string().optional(), conditionOperator: z.enum(['equals', 'not_equals', 'contains', 'exists', 'gt', 'gte', 'lt', 'lte']).optional(), conditionValue: z.string().optional(), conditionCompareMode: z.enum(['literal', 'field']).optional(), conditionValueField: z.string().optional(),
  conditionSource: z.enum(['manual', 'ai']).optional(), conditionReviewStatus: z.enum(['pending_review', 'approved', 'rejected']).optional(), conditionExplanation: z.string().optional(),
});
const customerListSchema = z.object({ id: z.string(), type: z.enum(['blacklist', 'whitelist']), name: z.string(), note: z.string(), strategic: z.boolean().optional(), enabled: z.boolean(), creditGrade: z.string().optional(), collectionHealth: z.string().optional(), sourceFile: z.string().optional(), updatedAt: z.string().optional() });
const configurationSchema = z.object({ version: z.string(), sourceDocument: z.string(), updatedAt: z.string(), rules: z.array(riskRuleSchema), customerLists: z.array(customerListSchema) });

export function defaultRiskConfiguration(now = new Date().toISOString()): RiskConfiguration {
  return { version: '2026-08', sourceDocument: 'GL-A-006 亚信科技商机准入前置管理办法V4.0、附件1、附件2', updatedAt: now, rules: structuredClone(DEFAULT_RISK_RULES), customerLists: structuredClone(DEFAULT_CUSTOMER_LISTS) };
}

let runtimeConfiguration: RiskConfiguration | undefined;

export function getRuntimeRiskConfiguration(): RiskConfiguration {
  return runtimeConfiguration ? structuredClone(runtimeConfiguration) : defaultRiskConfiguration();
}

export function setRuntimeRiskConfiguration(input: unknown): RiskConfiguration {
  const parsed = configurationSchema.parse(input);
  runtimeConfiguration = {
    ...parsed,
    rules: parsed.rules.map((rule) => ({
      ...rule,
      name: rule.name?.trim() || rule.riskPoint,
      recognitionGuidance: rule.recognitionGuidance?.trim() || rule.riskPoint,
    })),
  };
  return structuredClone(runtimeConfiguration);
}

export function customerListMatch(name: unknown, type: CustomerListType): CustomerListEntry | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  const normalized = name.replaceAll(/[（）()\s]/g, '').toLocaleLowerCase('zh-CN');
  return getRuntimeRiskConfiguration().customerLists.find((entry) => entry.enabled && entry.type === type && (
    normalized.includes(entry.name.replaceAll(/[（）()\s]/g, '').toLocaleLowerCase('zh-CN'))
    || entry.name.replaceAll(/[（）()\s]/g, '').toLocaleLowerCase('zh-CN').includes(normalized)
  ));
}

export function riskRuleLabel(level: RiskLevel): string {
  return level === 'absolute' ? '绝对禁止' : level === 'principle' ? '原则禁止' : '审批准入';
}
