import { getPreauditService, getTemplateByToken } from '@/domain/preaudit/bootstrap';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { PreauditServiceError } from '@/domain/preaudit/service';
import { isFileSizeValid, isSupportedAudioType, transcribeAudio } from '@/lib/transcription';
import { correctSpeechTranscript } from '@/lib/transcription-correction';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: RouteContext<'/api/s/[token]/transcribe'>) {
  try {
    const { token } = await params;
    if (!await getTemplateByToken(token)) {
      throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    }
    const formData = await request.formData();
    const audio = formData.get('audio');
    const projectId = formData.get('projectId');
    if (!(audio instanceof File)) throw new PreauditServiceError('INVALID_AUDIO', '请上传音频文件');
    if (!isSupportedAudioType(audio.type)) throw new PreauditServiceError('INVALID_AUDIO', `不支持的音频格式: ${audio.type}`);
    if (!isFileSizeValid(audio.size)) throw new PreauditServiceError('INVALID_AUDIO', '音频文件大小超过限制（最大 25MB）');
    let correctionContext: string[] = [];
    if (typeof projectId === 'string' && projectId) {
      const project = await (await getPreauditService()).getProject(projectId);
      if (project.token !== token) throw new PreauditServiceError('INVALID_PROJECT_ID', '项目不属于当前模板');
      correctionContext = [
        project.answers.contractName?.value,
        project.answers.customerName?.value,
        project.answers.endUserName?.value,
        project.answers.supplierName?.value,
        project.answers.salesBg?.value,
      ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    }
    const transcription = await transcribeAudio(await audio.arrayBuffer(), audio.type);
    const corrected = await correctSpeechTranscript(transcription, correctionContext);
    return jsonResponse({
      transcription: corrected.text,
      rawTranscription: transcription,
      correctionApplied: corrected.applied,
      projectId: typeof projectId === 'string' ? projectId : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
