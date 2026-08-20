import { generateObject } from 'ai';
import { z } from 'zod';
import { getDefaultModel, getLLMProvider } from '@/lib/llm';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { getTemplateDefinition } from '@/domain/preaudit/template';

export const runtime = 'nodejs';

const suggestionSchema = z.object({
  conditionField: z.string().optional(),
  conditionOperator: z.enum(['equals', 'not_equals', 'contains', 'exists', 'gt', 'gte', 'lt', 'lte']).optional(),
  conditionValue: z.string().optional(),
  conditionCompareMode: z.enum(['literal', 'field']).optional(),
  conditionValueField: z.string().optional(),
  explanation: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; riskPoint?: unknown; requirement?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const riskPoint = typeof body.riskPoint === 'string' ? body.riskPoint.trim() : '';
    const requirement = typeof body.requirement === 'string' ? body.requirement.trim() : '';
    if (!name || !requirement) return jsonResponse({ error: { code: 'INVALID_RISK_RULE', message: '风险名称和管控要求不能为空' } }, 400);

    const fields = getTemplateDefinition({ version: '2026-08' }).fields
      .map((field) => `${field.key}：${field.label}（${field.type}）`)
      .join('\n');
    const result = await generateObject({
      model: getLLMProvider()(getDefaultModel()),
      schema: suggestionSchema,
      schemaName: 'risk_condition_suggestion',
      system: '你是企业合同风险规则配置助手。只能根据给定的管控要求提出触发条件草案，不能自行扩大制度含义。输出的触发字段和字段比较目标必须来自给定字段清单。需要比较两个项目字段时，使用 conditionCompareMode=field 和 conditionValueField，例如 customerName 等于 supplierName；需要和固定值比较时使用 literal。管控要求无法明确映射到字段时，相关条件字段留空，并在 explanation 中说明需要人工定义。该结果只供人工核查，不能视为正式风险结论。',
      prompt: `请为以下风险规则建议结构化触发条件。\n风险名称：${name}\n风险点：${riskPoint || '未填写'}\n管控要求：${requirement}\n\n可用字段：\n${fields}\n\n数值条件优先使用 gt/gte/lt/lte；布尔条件的值使用 true 或 false；如果是两个字段动态比较，必须返回 conditionCompareMode=field 和 conditionValueField；未知或无法确定时留空。`,
    });
    return jsonResponse({ suggestion: result.object, reviewStatus: 'pending_review', source: 'ai' });
  } catch (error) {
    return errorResponse(error);
  }
}
