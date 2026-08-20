import { getPreauditService, getTemplateRegistry } from '@/domain/preaudit/bootstrap';
import { createExportFileName, exportPreauditWorkbook } from '@/domain/preaudit/excel-adapter';
import { createFeishuDocumentTitle, createMarkdownFileName, renderPreauditMarkdown } from '@/domain/preaudit/markdown-adapter';
import { errorResponse } from '@/domain/preaudit/http';
import { TemplateRegistryError } from '@/domain/preaudit/template-registry';
import { createFeishuMarkdownDocument, FeishuDocumentError } from '@/lib/feishu-documents';

export const runtime = 'nodejs';

async function exportProject(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const service = await getPreauditService();
    const project = await service.getProjectForExport(id);
    const requestedFormat = new URL(request.url).searchParams.get('format');
    const markdown = requestedFormat === 'md' || requestedFormat === 'markdown' || project.templateVersion === '2026-08';
    if (markdown) {
      const content = renderPreauditMarkdown(project);
      const documentTitle = createFeishuDocumentTitle(project);
      const feishuContent = renderPreauditMarkdown(project, { documentTitle });
      let feishuDocument = project.feishuDocument;
      let feishuStatus: 'existing' | 'created' | 'failed' = feishuDocument ? 'existing' : 'failed';
      let feishuMessage = feishuDocument ? '飞书文档已存在' : '';
      if (!feishuDocument) {
        try {
          feishuDocument = await createFeishuMarkdownDocument(feishuContent, documentTitle);
          await service.recordFeishuDocument(project.id, feishuDocument);
          feishuStatus = 'created';
          feishuMessage = '飞书文档已生成';
        } catch (error) {
          feishuStatus = 'failed';
          feishuMessage = error instanceof FeishuDocumentError
            ? error.message
            : '飞书文档生成失败，请检查飞书 CLI 授权、网络连接后重试';
          console.warn('[Preaudit] Feishu document generation failed', {
            projectId: project.id,
            reason: feishuMessage,
          });
        }
      }
      if (feishuStatus !== 'failed' && project.status === 'reviewed') await service.markManualSubmission(project.id);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(createMarkdownFileName(project))}`,
          'X-Feishu-Doc-Status': feishuStatus,
          'X-Feishu-Doc-Message': encodeURIComponent(feishuMessage),
          ...(feishuDocument ? {
            'X-Feishu-Doc-Title': encodeURIComponent(feishuDocument.title),
            'X-Feishu-Doc-URL': feishuDocument.url,
          } : {}),
          'Access-Control-Expose-Headers': 'X-Feishu-Doc-Status, X-Feishu-Doc-Message, X-Feishu-Doc-Title, X-Feishu-Doc-URL',
        },
      });
    }
    const registry = await getTemplateRegistry();
    const template = await registry.getByToken(project.token);
    if (!template) throw new TemplateRegistryError('TEMPLATE_NOT_FOUND', '项目关联的审批模板不存在');
    const workbook = await exportPreauditWorkbook(project, {
      templatePath: registry.templatePath(template),
      templateVersion: project.templateVersion,
    });
    if (project.status === 'reviewed') await service.markManualSubmission(project.id);
    const fileName = createExportFileName(project);
    return new Response(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return exportProject(request, context);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return exportProject(request, context);
}
