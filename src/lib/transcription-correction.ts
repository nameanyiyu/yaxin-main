import { generateText } from 'ai';
import { getDefaultModel, getLLMProvider } from './llm';

export interface TranscriptionCorrectionResult {
  text: string;
  applied: boolean;
}

function cleanModelText(value: string): string {
  return value
    .trim()
    .replace(/^```(?:text|中文)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^「([\s\S]*)」$/, '$1')
    .trim();
}

export async function correctSpeechTranscript(
  transcription: string,
  context: string[] = [],
): Promise<TranscriptionCorrectionResult> {
  const original = transcription.trim();
  if (!original) return { text: original, applied: false };

  try {
    const result = await generateText({
      model: getLLMProvider()(getDefaultModel()),
      system: '你是企业审批访谈的中文语音纠错助手。只修正语音识别产生的同音字、错别字、断句和明显术语错误，不改变销售原意，不补充未经回答的事实。只输出纠正后的完整中文文本，不要解释修改内容，不要加引号。',
      prompt: [
        context.length ? `项目上下文（只用于判断术语，不得新增事实）：\n${context.join('\n')}` : '',
        `原始语音转写：\n${original}`,
      ].filter(Boolean).join('\n\n'),
    });
    const corrected = cleanModelText(result.text);
    if (!corrected || corrected.length > Math.max(20000, original.length * 4)) {
      return { text: original, applied: false };
    }
    return { text: corrected, applied: corrected !== original };
  } catch (error) {
    console.warn('[Transcription] semantic correction skipped', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return { text: original, applied: false };
  }
}
