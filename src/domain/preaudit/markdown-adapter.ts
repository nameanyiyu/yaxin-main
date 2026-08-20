import { getRuntimeRiskConfiguration, riskRuleLabel } from './risk-config';
import { riskControlLevelLabel } from './risk-level';
import { getTemplateDefinition } from './template';
import type { FieldValue, PreauditProject, RiskFinding } from './types';

const NL = String.fromCharCode(10);

function value(project: PreauditProject, key: string): FieldValue | undefined {
  return project.answers[key]?.value;
}

function text(valueToDisplay: FieldValue | undefined, fallback = '未填写'): string {
  if (valueToDisplay === undefined || valueToDisplay === '') return fallback;
  if (typeof valueToDisplay === 'boolean') return valueToDisplay ? '是' : '否';
  return String(valueToDisplay);
}

function cell(valueToDisplay: FieldValue | undefined, fallback = '【请填写】'): string {
  return text(valueToDisplay, fallback).replaceAll('|', '\\|').replaceAll(NL, '<br>');
}

function riskLabel(finding: RiskFinding): string {
  if (finding.missingKeys.length) return `待补充（${finding.missingKeys.join('、')}）`;
  if (!finding.triggered) return '未触发';
  return `已触发｜${riskControlLevelLabel(finding)}`;
}

function riskRows(project: PreauditProject): string {
  const configured = getRuntimeRiskConfiguration().rules;
  const findings = project.risks.filter((finding) => finding.triggered || finding.missingKeys.length > 0);
  if (!findings.length) return '| 未命中已配置风险 | 当前证据未触发风险 | 未触发 | 已按 BG 规则完成初步判断 |';
  return findings.map((finding) => {
    const config = configured.find((rule) => rule.id === finding.ruleId);
    const requirement = config ? `${riskRuleLabel(config.level)}：${config.requirement}` : finding.impact;
    const situation = finding.missingKeys.length ? `缺失：${finding.missingKeys.join('、')}` : finding.reason;
    return `| ${finding.title} | ${requirement} | ${riskLabel(finding)} | ${situation}；措施：${finding.impact} |`;
  }).join(NL);
}

function narrative(project: PreauditProject, key: string, fallback: string): string {
  return cell(value(project, key), fallback);
}

export function renderPreauditMarkdown(project: PreauditProject, options: { documentTitle?: string } = {}): string {
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const triggered = project.risks.filter((risk) => risk.triggered).map((risk) => risk.title).join('、') || '未触发已配置风险（仍需人工核验）';
  const hasProcurement = value(project, 'hasProcurement') === true;
  const hasFinancing = value(project, 'hasDirectFinancing') === true || value(project, 'hasPotentialFinancing') === true;
  const lines = [
    `# ${options.documentTitle ?? '商机准入前置特批审批表\\-云文档模版\\-202608发布'}`,
    '',
    '**使用说明：**本文件由系统根据 2026 年 8 月发布的云文档模板生成。事业部需保证信息真实准确，并保证承诺性条款能够及时有效达成。',
    '',
    '## 一、特批项目基本情况',
    '',
    `|所属BG|${cell(value(project, 'salesBg'))}|销售BU|${cell(value(project, 'salesBu'))}|`,
    '|---|---|---|---|',
    `|项目名称|${cell(value(project, 'contractName'))}|||`,
    `|触碰管控点|${triggered}|||`,
    `|签约客户全称（评级及回款健康度）|${cell(value(project, 'customerName'))}（${cell(value(project, 'customerRating'))}，回款健康度 ${cell(value(project, 'customerCollectionHealth'))}级）|最终用户全称（评级及回款健康度）|${cell(value(project, 'endUserName'))}（${cell(value(project, 'endUserRating'), '未提供')}）|`,
    `|供应商全名及评级|${cell(value(project, 'supplierName'), hasProcurement ? '【请填写】' : '不涉及')}（${cell(value(project, 'supplierRating'), '未提供')}）|||`,
    `|合同总额（CNY）|${cell(value(project, 'contractAmountCny'))}|合同利润率（GM1）|${cell(value(project, 'gm1'))}%|`,
    `|事业部承诺|${cell(value(project, 'divisionCommitment'))}|||`,
    `|销售区域|${cell(value(project, 'salesRegion'))}|销售经理|${cell(value(project, 'salesManager'))}|`,
    '',
    '## 二、审批管控点',
    '',
    '**说明：**以下内容按所属 BG 的 2026 年 8 月管控规则生成。不涉及的风险维度可在提交前删除或隐藏。',
    '',
    '|风险维度|管控要求|触碰情况|',
    '|---|---|---|',
    riskRows(project),
    '',
    '## 三、项目整体说明',
    '',
    '|类别|关注点|事业部反馈（必填）|',
    '|---|---|---|',
    `|**销售合同**|商机来源、签署原因|${narrative(project, 'opportunitySource', '【请填写商机来源】')}|`,
    `||项目背景及政策|${narrative(project, 'projectBackground', '【请填写项目背景及相关政策】')}|`,
    `||签约链条及签约进展|${narrative(project, 'contractChainProgress', '【请填写签约链条结构及当前签约进展】')}|`,
    `||资金方及资金来源与落实情况|${narrative(project, 'fundingStatus', '【请填写资金方信息、资金来源及落实情况】')}|`,
    `||重要商务条款（提供内容、付款条款、验收交付条款）|${narrative(project, 'commercialTerms', '【请填写重要商务条款详情】')}|`,
    `||项目金额、利润及收入确认方法|${narrative(project, 'amountMarginRecognition', '【请填写项目金额、利润及收入确认方法】')}|`,
    `|**采购合同（如涉及）**|采购类型、内容、原因及预算情况|${narrative(project, 'procurementOverview', hasProcurement ? '【请填写】' : '不涉及')}|`,
    `||供应商情况说明|${narrative(project, 'supplierOverview', hasProcurement ? '【请填写】' : '不涉及')}|`,
    `||采购形式及重要商务条款|${narrative(project, 'procurementTerms', hasProcurement ? '【请填写】' : '不涉及')}|`,
    `|**垫资（如涉及）**|垫资情况说明|${narrative(project, 'financingOverview', hasFinancing ? '【请填写】' : '不涉及')}|`,
    '',
    '## 四、项目签约意义',
    '',
    '|类别|关注点|事业部反馈（必填）|',
    '|---|---|---|',
    `|**战略契合度**|与公司的战略发展方向是否契合，对公司的战略发展意义|${narrative(project, 'strategicAlignment', '【请填写战略契合度说明】')}|`,
    `|**公司产品能力**|与公司的产品是否相关，能否拓展公司产品销售渠道|${narrative(project, 'productCapability', '【请填写公司产品能力相关说明】')}|`,
    `|**项目延续性**|本项目是否为公司提供延续性项目|${narrative(project, 'projectContinuity', '【请填写项目延续性说明】')}|`,
    '',
    '## 五、历史合作情况',
    '',
    cell(value(project, 'historicalCooperation'), '【如涉及历史合作，请梳理历史合作情况，如是否涉及应收、未达成承诺等情况】'),
    '',
    '## 六、项目风险点梳理及管控措施',
    '',
    '|类别|关注点|事业部反馈（必填）|',
    '|---|---|---|',
    `|**签约风险**|商务关系、进度金额、合作内容、成本投入、毛利率保障|${narrative(project, 'contractRiskControl', '【请填写签约风险及管控措施】')}|`,
    `|**交付风险**|项目把控能力、交付人员稳定性、项目现场关系、验收交付标准|${narrative(project, 'deliveryRiskControl', '【请填写交付风险及管控措施】')}|`,
    `|**回款风险**|项目资金来源、资金是否已到位、客户自身经营等|${narrative(project, 'collectionRiskControl', '【请填写回款风险及管控措施】')}|`,
    `|**其它涉及的风险类别**|可根据实际情况补充|${narrative(project, 'otherRiskControl', '【可根据实际情况补充】')}|`,
    '',
    '## 七、承诺性条款',
    '',
    '|类别|关注点|事业部反馈|',
    '|---|---|---|',
    `|**回款承诺**|涉及回款具体时间承诺|${cell(value(project, 'collectionCommitment'), '【必填】')}|`,
    `|**交付承诺**|涉及交付质量保证承诺|${cell(value(project, 'deliveryCommitment'), '【必填】')}|`,
    `|**利润承诺**|利润达标承诺|${cell(value(project, 'marginCommitment'), '【必填】')}|`,
    `|**供应商承诺**|涉及与供应商付款、风控条款落实承诺|${cell(value(project, 'supplierCommitment'), hasProcurement ? '【可选填写】' : '不涉及')}|`,
    `|**新商机承诺**|涉及衍生新项目承诺|${cell(value(project, 'newOpportunityCommitment'), '【必填；无则明确填写暂无】')}|`,
    `|**其他**|其他方面承诺|${cell(value(project, 'otherCommitment'), '【可选填写】')}|`,
    '',
    '---',
    '',
    `**系统核验说明：**本文件由模板“${template.name}”生成。风险清单、黑名单和白名单均应以系统当前配置及发布文件为准；人工确认项不得由系统自动推断。`,
  ];
  return lines.join(NL) + NL;
}

export function createMarkdownTemplateSource(): string {
  return [
    '# 商机准入前置特批审批表\\-云文档模版\\-202608发布', '',
    '本模板由系统根据《GL-A-006 亚信科技商机准入前置管理办法 V4.0》及 2026 年 8 月发布附件维护。', '',
    '> 说明：带有【】的内容由事业部填写；风险点将根据所属 BG、项目证据和黑白名单配置动态生成。', '',
    '下载或填写时请保留以下章节：基本情况、审批管控点、项目整体说明、项目签约意义、历史合作情况、风险点及管控措施、承诺性条款。',
  ].join(NL) + NL;
}

export function createMarkdownFileName(project: PreauditProject): string {
  const name = text(value(project, 'contractName'), project.id).replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
  return `${name}-商机准入前置特批审批表.md`;
}

export function createFeishuDocumentTitle(project: PreauditProject): string {
  const name = text(value(project, 'contractName'), project.id).replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80);
  return `【${name}】商机准入前置审批文档`;
}
