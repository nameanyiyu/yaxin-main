import { readFile } from 'node:fs/promises';
import { getTemplateRegistry } from '@/domain/preaudit/bootstrap';
import { errorResponse } from '@/domain/preaudit/http';
import { createMarkdownTemplateSource } from '@/domain/preaudit/markdown-adapter';
import { TemplateRegistryError } from '@/domain/preaudit/template-registry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new TemplateRegistryError('TEMPLATE_NOT_FOUND', '缺少审批模板编号');
    const registry = await getTemplateRegistry();
    const template = await registry.get(id);
    if (!template) throw new TemplateRegistryError('TEMPLATE_NOT_FOUND', '审批模板不存在');
    if (template.format === 'markdown' || template.version === '2026-08') {
      return new Response(createMarkdownTemplateSource(), {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(template.fileName)}`,
        },
      });
    }
    const bytes = await readFile(/* turbopackIgnore: true */ registry.templatePath(template));
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(template.fileName)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
