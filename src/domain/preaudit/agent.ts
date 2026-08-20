import { hasToolCall, isStepCount, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { APP_CONFIG } from '@/config';
import { getDefaultModel, getLLMProvider } from '@/lib/llm';
import { toInterviewBatchPayload } from './interview-batches';
import { normalizeCommitmentValue } from './fallback-extraction';
import { getRuntimeRiskConfiguration } from './risk-config';
import { findAnswerConsistencyIssues } from './answer-consistency';
import {
  BACKEND_VERIFICATION_FIELD_KEYS,
  getCommitmentGaps,
  getMissingSalesReviewFields,
  isSalesReadyForReview,
  riskRuleAppliesToProject,
  unresolvedSalesRiskKeys,
} from './reporting-flow';
import type { PreauditService } from './service';
import { getTemplateDefinition } from './template';
import type { PreauditProject } from './types';

const fieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const narrativeKeys = [
  'divisionCommitment',
  'opportunitySource',
  'projectBackground',
  'contractChainProgress',
  'fundingStatus',
  'commercialTerms',
  'amountMarginRecognition',
  'procurementOverview',
  'supplierOverview',
  'procurementTerms',
  'financingOverview',
  'strategicAlignment',
  'productCapability',
  'projectContinuity',
  'contractRiskControl',
  'deliveryRiskControl',
  'collectionRiskControl',
  'collectionCommitment',
  'deliveryCommitment',
  'marginCommitment',
  'supplierCommitment',
  'newOpportunityCommitment',
  'otherCommitment',
  'historicalCooperation',
  'otherRiskControl',
] as const;

export function buildPreauditAgentInstructions(
  project: Pick<PreauditProject, 'salesName'> & Partial<Pick<PreauditProject, 'answers'>>,
  fieldDescription: string,
  collected: string,
): string {
  const configuredRiskRules = getRuntimeRiskConfiguration().rules
    .filter((rule) => {
      if (rule.status === 'disabled') return false;
      const bg = project.answers?.salesBg?.value;
      return rule.scope === 'COMPANY' || (typeof bg === 'string' && rule.scope === (bg.toUpperCase() === 'SIG' ? 'SCG' : bg.toUpperCase()));
    })
    .map((rule) => `- 规则ID=${rule.id}｜层级=${rule.scope}｜名称=${rule.name || rule.riskPoint}｜AI识别标准=${rule.recognitionGuidance || rule.riskPoint}｜管理要求=${rule.requirement}｜信息不足时追问=${rule.question}`)
    .join('\n');
  return `你是亚信科技域外合同前置审批访谈助手。你的定位是帮助销售梳理项目，而不是审问销售。销售输入来自中文语音识别，可能包含同音字、错别字、断句错误、口头语、重复和自我修正。你必须发挥语义理解能力，结合项目审批上下文还原真实含义，再提取结构化字段、整理综合说明、解释确定性风险结果并按文档分区追问。

严格规则：
1. 每次收到回答后，先在内部完成“语音语义还原”：忽略无意义语气词，根据上下文修正明显同音错字和错误断句，并识别销售对前文的纠正。不要输出纠错过程，也不要依赖机械关键词匹配。
2. 必须扫描整段回答，逐句列出所有可恢复事实并映射到全部相关模板字段，不限于当前问题。强上下文支持的同音纠错可视为明确事实；只有存在两种以上合理解释时才不保存并追问。调用 extractProjectFields 一次性保存所有置信度足够的结构化结果，不得只保存最明显的少数字段，不得编造。
   如果销售明确表示最终用户与签约客户是同一家公司，必须把同一个完整公司名称同时写入 customerName 和 endUserName，不能只保存“相同”“同上”等指代词。
3. 同一段回答包含组合信息时，必须同步提炼综合说明字段，而不是要求销售原样再说一次：
   - 合同额、净销售额、税率、GM1、渠道费用 → amountMarginRecognition；
   - 建设内容、业务场景、工期 → projectBackground；
   - 客户关系、直签/分包、签约进展 → contractChainProgress；
   - 资金方、资金来源、落实情况 → fundingStatus；
   - 付款比例、付款节点、验收、交付周期 → commercialTerms；
   - 涉及采购/供应商/垫资时，同步整理 procurementOverview、supplierOverview、procurementTerms、financingOverview。
   综合说明用 1-3 句精炼中文保存；允许基于同一段已确认事实归纳，不算编造。
4. 保存后只追问持久化项目中仍缺失且适用的字段，不得重复追问已有事实。销售说“刚才已经说了”时，要结合本次回答和已收集数据补全，不得机械重复问题。
5. 提取字段时必须同步对照当前项目适用的风险配置：公司级规则始终适用，BG 规则只在所属 BG 一致时适用。仅当销售回答提供了明确证据时，才在 extractProjectFields 的 riskAssessments 中提交 triggered 或 clear；不得因销售未提及而判定 clear。无法确定时不要提交结论，应使用配置中的销售追问继续核实。AI 只判断是否触碰并说明理由，不得修改风险级别和管理要求。
6. 完成字段提取后，必须核对结构化字段与资金、付款、垫资、采购、签约链条等综合说明是否相互矛盾。若发现矛盾，不得自行选择一方覆盖另一方，必须保留待确认状态并通过下一批问题向销售核实；“资金已落实”和“非背靠背付款”本身不构成矛盾，只有付款依赖上游回款、资金落实状态相反等证据出现时才追问。
7. 调用工具前不得输出任何面向销售的过程说明。完成全量提取和综合说明后必须先调用 checkAnswerConsistency，再调用 getNextInterviewBatch；最终回复必须逐字输出 getNextInterviewBatch 返回的 message，不能改写、不能拆分、不能增加其他文字或问题。
8. 金额统一转换为人民币元；百分比必须保存为 0-100 的“百分数点数”，例如“GM1 12%”保存 12、“预付款20%”保存 20，严禁保存为 0.12 或 0.2；布尔值使用 true/false。
   签约链条层级 chainLevel 必须使用标准值：直签保存 direct，一级分包保存 first_subcontractor，二级及更下级分包保存 downstream_subcontractor。
9. 客户评级、回款健康度、黑白名单、供应商评级和供应商高风险状态由系统或后台核验。即使销售主动猜测也不要写入这些字段，更不能要求销售自行评价。
10. 严格按“项目汇报、信息确认、风险核对、应对与承诺、完成送审”五个阶段推进。信息确认和风险核对必须等待页面上的销售操作；每轮最多输出两个相互关联的问题。
11. 回款、利润、交付、新商机四类承诺全部必答，涉及采购时供应商承诺也必答。销售先说，Agent 只能基于销售明确事实补齐规范表述，不能虚构指标、日期、负责人、保障措施或证据。承诺必须覆盖目标、时间（利润承诺可用目标替代日期）、责任人和保障措施；回款需包含首笔与全部回款，交付需包含验收时间和标准。新商机确实不存在时允许记录“暂无新商机承诺”，不得诱导销售虚构商机。
12. 项目价值允许为“无”，不得硬凑。收集承诺前必须保留正式审批和后续跟踪提醒。问答没有固定轮数或次数上限，但每轮不得超过两个问题。
13. 工具返回 readyForReview 时提示销售核对承诺卡后送审。最终送审由销售在页面确认；绝对禁止风险只允许继续送内部后台复核，绝不能描述为自动准入或可以签约。
14. 以下仅是当前项目适用且后台已启用的风险配置。你必须用规则 ID 回传语义识别结果；系统会把 AI 结果与确定性规则引擎合并，并按配置中的级别和管理要求展示。AI 识别结果必须标记人工复核：
${configuredRiskRules || '（暂无启用规则）'}

当前填写人：${project.salesName}
模板字段：
${fieldDescription}

已收集数据：
${collected || '（暂无）'}`;
}

export async function createPreauditAgent(projectId: string, service: PreauditService) {
  const project = await service.getProject(projectId);
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const fieldKeys = template.fields.map((field) => field.key) as [string, ...string[]];
  const fieldKeySchema = z.enum(fieldKeys);
  const activeRiskRuleIds = new Set(getRuntimeRiskConfiguration().rules
    .filter((rule) => rule.status !== 'disabled' && riskRuleAppliesToProject(rule, project))
    .map((rule) => rule.id));
  const fieldDescription = template.fields
    .map(
      (field) =>
        `- ${field.key}｜${field.label}｜${field.type}｜${field.required || field.requiredWhen ? '必填/条件必填' : '选填'}${field.guidance ? `｜${field.guidance}` : ''}`,
    )
    .join('\n');
  const collected = Object.entries(project.answers)
    .map(([key, answer]) => `- ${key}: ${String(answer.value)}`)
    .join('\n');

  return new ToolLoopAgent({
    id: 'preaudit-fixed-template-interviewer',
    model: getLLMProvider()(getDefaultModel()),
    instructions: buildPreauditAgentInstructions(project, fieldDescription, collected),
    tools: {
      extractProjectFields: tool({
        description: '结合审批上下文理解语音转录，一次性提取全部结构化字段，并同步判断有明确证据的已配置风险。',
        inputSchema: z.object({
          fields: z.array(
            z.object({
              key: fieldKeySchema,
              value: fieldValueSchema,
              confidence: z.number().min(0).max(1),
            }),
          ),
          riskAssessments: z.array(
            z.object({
              ruleId: z.string(),
              result: z.enum(['triggered', 'clear']),
              confidence: z.number().min(0).max(1),
              reason: z.string().min(1),
              evidenceKeys: z.array(fieldKeySchema),
            }),
          ).optional().default([]),
        }),
        execute: async ({ fields, riskAssessments }) => {
          const accepted = fields.filter((field) => field.confidence >= APP_CONFIG.agent.confidenceThreshold && !BACKEND_VERIFICATION_FIELD_KEYS.has(field.key));
          const values = Object.fromEntries(accepted.map((field) => [
            field.key,
            typeof field.value === 'string' ? normalizeCommitmentValue(field.key, field.value) : field.value,
          ]));
          let updated = Object.keys(values).length
            ? await service.updateAnswers(projectId, values, 'agent', {
                confidenceByKey: Object.fromEntries(accepted.map((field) => [field.key, field.confidence])),
                confirmationStatus: 'needs_confirmation',
              })
            : await service.getProject(projectId);
          const acceptedAssessments = riskAssessments.filter(
            (assessment) => assessment.confidence >= APP_CONFIG.agent.confidenceThreshold && activeRiskRuleIds.has(assessment.ruleId),
          );
          if (acceptedAssessments.length) {
            updated = await service.updateAiRiskAssessments(projectId, acceptedAssessments);
          }
          return {
            acceptedKeys: accepted.map((field) => field.key),
            rejectedKeys: fields.filter((field) => !accepted.includes(field)).map((field) => field.key),
            acceptedRiskRuleIds: acceptedAssessments.map((assessment) => assessment.ruleId),
            rejectedRiskRuleIds: riskAssessments.filter((assessment) => !acceptedAssessments.includes(assessment)).map((assessment) => assessment.ruleId),
            totalAnswered: Object.keys(updated.answers).length,
            risks: updated.risks,
          };
        },
      }),
      evaluateProjectRisks: tool({
        description: '读取项目并返回确定性规则与 AI 语义识别合并后的最新风险结论。',
        inputSchema: z.object({}),
        execute: async () => (await service.getProject(projectId)).risks,
      }),
      checkAnswerConsistency: tool({
        description: '核查已保存的结构化字段与综合说明是否存在上下文矛盾；发现矛盾时必须先追问销售确认，不能自行覆盖。',
        inputSchema: z.object({}),
        execute: async () => ({
          issues: findAnswerConsistencyIssues(await service.getProject(projectId)),
        }),
      }),
      getNextInterviewBatch: tool({
        description: '根据持久化项目缺项返回当前文档分区的下一批问题；不限制问答次数。',
        inputSchema: z.object({}),
        execute: async () => {
          const latest = await service.getProject(projectId);
          const payload = toInterviewBatchPayload(latest);
          await service.recordInterviewBatch(projectId, payload.topicIds, payload.notifiedRiskIds);
          return {
            ...payload,
            riskFindings: latest.risks,
          };
        },
      }),
      draftProjectNarratives: tool({
        description: '根据已确认信息起草项目说明、签约意义、管控措施和承诺字段。',
        inputSchema: z.object({
          drafts: z.array(
            z.object({
              key: z.enum(narrativeKeys),
              value: z.string().min(1),
            }),
          ),
        }),
        execute: async ({ drafts }) => {
          const values = Object.fromEntries(drafts.map((draft) => [draft.key, normalizeCommitmentValue(draft.key, draft.value)]));
          const updated = await service.updateAnswers(projectId, values, 'agent', { confirmationStatus: 'needs_confirmation' });
          return { savedKeys: drafts.map((draft) => draft.key), updatedAt: updated.updatedAt };
        },
      }),
      markReadyForReview: tool({
        description: '检查项目是否具备提交后台复核条件，不直接改变项目状态。',
        inputSchema: z.object({}),
        execute: async () => {
          const latest = await service.getProject(projectId);
          return {
            ready: isSalesReadyForReview(latest),
            missingRequiredKeys: getMissingSalesReviewFields(latest).map((field) => field.key),
            commitmentGaps: getCommitmentGaps(latest),
            unresolvedRiskKeys: unresolvedSalesRiskKeys(latest),
          };
        },
      }),
    },
    stopWhen: [
      hasToolCall('getNextInterviewBatch'),
      isStepCount(APP_CONFIG.agent.maxSteps),
    ],
  });
}
