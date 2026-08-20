import { generateText } from 'ai';
import { APP_CONFIG } from '@/config';
import { getDefaultModel, getLLMProvider } from '@/lib/llm';
import { getRuntimeRiskConfiguration } from './risk-config';
import { riskRuleAppliesToProject } from './reporting-flow';
import { getTemplateDefinition } from './template';
import type { PreauditProject } from './types';

function projectContext(project: PreauditProject): string {
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const labels = new Map(template.fields.map((field) => [field.key, field.label]));
  const facts = Object.entries(project.answers)
    .map(([key, answer]) => `- ${labels.get(key) ?? key}：${String(answer.value)}（来源：${answer.source}）`)
    .join('\n');
  const risks = project.risks.filter((risk) => risk.triggered)
    .map((risk) => `- ${risk.title}：${risk.reason}；管控要求：${risk.controlRequirement ?? risk.impact}`)
    .join('\n') || '- 当前没有已确认命中的风险。';
  const rules = getRuntimeRiskConfiguration().rules
    .filter((rule) => rule.status !== 'disabled' && riskRuleAppliesToProject(rule, project))
    .map((rule) => `- ${rule.scope}/${rule.level}/${rule.riskPoint}：${rule.requirement}`)
    .join('\n');
  return `当前项目事实：\n${facts}\n\n当前风险结论：\n${risks}\n\n当前项目适用规则：\n${rules}`;
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === undefined || value === null || value === '') return '当前项目未记录，待后台核验。';
  return String(value);
}

function localReadOnlyAnswer(project: PreauditProject, question: string): string | undefined {
  if (/自动准入|自动通过|可以签约|是否准入/.test(question)) {
    return '当前项目仅表示已送后台复核，不代表自动准入或可以直接签约，最终以后台复核和审批结果为准。';
  }

  if (/适用.*风险规则|风险配置|哪些规则/.test(question)) {
    const rules = getRuntimeRiskConfiguration().rules
      .filter((rule) => rule.status !== 'disabled' && riskRuleAppliesToProject(rule, project))
      .map((rule) => `${rule.scope}/${rule.level}：${rule.name || rule.riskPoint}`);
    return rules.length ? `当前项目适用的启用规则：\n${rules.join('\n')}` : '当前项目没有匹配到启用的风险规则。';
  }

  if (/风险|红线|准入/.test(question)) {
    return fallbackAnswer(project, question);
  }

  if (/承诺|回款承诺|利润承诺|交付承诺|供应商承诺|新商机承诺/.test(question)) {
    return fallbackAnswer(project, question);
  }

  const fieldMatchers: Array<{ patterns: RegExp[]; keys: string[] }> = [
    { patterns: [/项目名称|合同名称|项目叫什么/], keys: ['contractName'] },
    { patterns: [/签约客户|客户名称|客户是谁|客户/], keys: ['customerName'] },
    { patterns: [/最终用户/], keys: ['endUserName'] },
    { patterns: [/合同总额|合同金额|合同额|项目金额/], keys: ['contractAmountCny'] },
    { patterns: [/GM1|利润率/], keys: ['gm1'] },
    { patterns: [/预付款|预付比例/], keys: ['prepaymentPercent'] },
    { patterns: [/背靠背/], keys: ['isBackToBackPayment'] },
    { patterns: [/所属\s*BG|所属事业部/], keys: ['salesBg'] },
    { patterns: [/是否采购|采购情况/], keys: ['hasProcurement'] },
    { patterns: [/签约进展|签约情况/], keys: ['contractChainProgress', 'upstreamSigned'] },
    { patterns: [/资金来源|资金方/], keys: ['fundingStatus', 'fundingPartyConfirmed'] },
    { patterns: [/交付时间|验收时间|交付安排/], keys: ['commercialTerms', 'deliveryCommitment'] },
  ];
  const matches = fieldMatchers.filter((matcher) => matcher.patterns.some((pattern) => pattern.test(question)));
  if (!matches.length) return undefined;

  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const labels = new Map(template.fields.map((field) => [field.key, field.label]));
  const lines = [...new Set(matches.flatMap((matcher) => matcher.keys))].map((key) =>
    `${labels.get(key) ?? key}：${displayValue(project.answers[key]?.value)}`,
  );
  return lines.join('\n');
}

function fallbackAnswer(project: PreauditProject, question: string): string {
  if (/风险|红线|准入|规则/.test(question)) {
    const triggered = project.risks.filter((risk) => risk.triggered);
    return triggered.length
      ? triggered.map((risk) => `${risk.title}：${risk.reason} 管控要求：${risk.controlRequirement ?? risk.impact}`).join('\n')
      : '当前项目没有已确认命中的风险，仍需以后台最终核验为准。';
  }
  if (/承诺|回款|利润|GM1|交付/.test(question)) {
    const keys = ['collectionCommitment', 'marginCommitment', 'deliveryCommitment', 'newOpportunityCommitment', 'supplierCommitment'];
    const labels: Record<string, string> = { collectionCommitment: '回款承诺', marginCommitment: '利润承诺', deliveryCommitment: '交付承诺', newOpportunityCommitment: '新商机承诺', supplierCommitment: '供应商承诺' };
    const grouped = new Map<string, string[]>();
    for (const key of keys) {
      const value = project.answers[key]?.value;
      if (typeof value !== 'string' || !value.trim()) continue;
      const names = grouped.get(value) ?? [];
      names.push(labels[key]);
      grouped.set(value, names);
    }
    const values = [...grouped.entries()].map(([value, names]) => `${names.join('、')}：${value}`);
    return values.length ? values.join('\n') : '当前项目尚未记录对应承诺。';
  }
  return '只读问答仅回答当前项目已记录事实和该项目适用的风险规则。当前模型服务暂时不可用，请稍后重试或向后台复核人员确认。';
}

export async function answerProjectQuestion(project: PreauditProject, question: string): Promise<string> {
  const normalized = question.trim();
  if (!normalized) return '请输入要查询的问题。';
  const localAnswer = localReadOnlyAnswer(project, normalized);
  if (localAnswer) return localAnswer;
  try {
    const result = await generateText({
      model: getLLMProvider()(getDefaultModel()),
      timeout: { totalMs: APP_CONFIG.agent.requestTimeoutMs },
      system: [
        '你是商机准入项目的只读问答助手。',
        '只能依据提供的当前项目事实、风险结论和适用规则回答。',
        '不得修改项目，不得建议绕过绝对禁止要求，不得把内部送审描述为已准入。',
        '资料没有明确记录时直接说“当前项目未记录/待后台核验”，禁止猜测。',
        '问题超出当前项目或适用规则范围时，简洁说明只读问答范围。',
      ].join('\n'),
      prompt: `${projectContext(project)}\n\n用户问题：${normalized}`,
    });
    return result.text.trim() || fallbackAnswer(project, normalized);
  } catch {
    return fallbackAnswer(project, normalized);
  }
}
