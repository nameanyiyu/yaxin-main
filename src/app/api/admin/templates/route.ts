import { getTemplateRegistry } from '@/domain/preaudit/bootstrap';
import { validateTemplateWorkbookBytes } from '@/domain/preaudit/excel-adapter';
import { errorResponse, jsonResponse } from '@/domain/preaudit/http';
import { TemplateRegistryError, type ManagedTemplateDefinition } from '@/domain/preaudit/template-registry';

export const runtime = 'nodejs';

function summary(template: ManagedTemplateDefinition) {
  return {
    id: template.id,
    version: template.version,
    name: template.name,
    fileName: template.fileName,
    token: template.token,
    format: template.format ?? 'xlsx',
    fieldCount: template.fields.length,
    builtin: template.builtin,
    sharePath: `/s/${template.token}`,
    sourcePath: `/api/admin/templates/source?id=${encodeURIComponent(template.id)}`,
  };
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function GET() {
  try {
    const registry = await getTemplateRegistry();
    return jsonResponse((await registry.list()).map(summary));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const source = formData.get('file');
    let sourceBytes: Uint8Array | undefined;
    if (source instanceof File && source.size > 0) {
      if (!source.name.toLowerCase().endsWith('.xlsx')) {
        throw new TemplateRegistryError('INVALID_TEMPLATE_FILE', '审批模板必须是 .xlsx 文件');
      }
      if (source.size > 10 * 1024 * 1024) {
        throw new TemplateRegistryError('INVALID_TEMPLATE_FILE', '审批模板文件不能超过10MB');
      }
      const bytes = await source.arrayBuffer();
      validateTemplateWorkbookBytes(bytes);
      sourceBytes = new Uint8Array(bytes);
    }
    const registry = await getTemplateRegistry();
    const template = await registry.create({
      name: formText(formData, 'name'),
      version: formText(formData, 'version'),
      token: formText(formData, 'token'),
      sourceBytes,
    });
    return jsonResponse({ template: summary(template) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
