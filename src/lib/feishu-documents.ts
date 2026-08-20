import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import type { FeishuDocumentReference } from '@/domain/preaudit/types';

const execFileAsync = promisify(execFile);

interface CreateDocumentPayload {
  ok?: boolean;
  data?: {
    document?: {
      document_id?: string;
      title?: string;
      url?: string;
    };
  };
  error?: string;
}

export class FeishuDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeishuDocumentError';
  }
}

async function cliInvocation(): Promise<{ command: string; prefixArgs: string[] }> {
  const configured = process.env.LARK_CLI_PATH?.trim();
  if (process.platform !== 'win32') {
    return { command: configured || 'lark-cli', prefixArgs: [] };
  }

  // Node cannot reliably exec npm's .cmd shim directly on Windows (spawn EINVAL).
  // Invoke the package's JavaScript entry with the current Node executable instead.
  const npmDirectory = configured?.toLowerCase().endsWith('.cmd')
    ? dirname(configured)
    : join(process.env.APPDATA || '', 'npm');
  const scriptPath = process.env.LARK_CLI_SCRIPT_PATH?.trim()
    || (configured?.toLowerCase().endsWith('.js')
      ? configured
      : join(npmDirectory, 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js'));
  try {
    await access(scriptPath);
  } catch {
    throw new FeishuDocumentError('飞书文档创建失败：未找到飞书 CLI 的 Node 入口，请重新安装 lark-cli');
  }
  return { command: process.execPath, prefixArgs: [scriptPath] };
}

function parsePayload(stdout: string): CreateDocumentPayload {
  try {
    return JSON.parse(stdout) as CreateDocumentPayload;
  } catch {
    throw new FeishuDocumentError('飞书文档创建失败：命令行未返回有效结果');
  }
}

export async function createFeishuMarkdownDocument(content: string, title: string): Promise<FeishuDocumentReference> {
  // lark-cli intentionally rejects @file paths outside its current working directory.
  // Keep the short-lived import file inside the application directory and remove it in finally.
  const workDir = await mkdtemp(join(process.cwd(), '.preaudit-feishu-'));
  const contentPath = join(workDir, 'approval.md');
  const relativePath = relative(process.cwd(), contentPath).replaceAll('\\', '/');
  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../')) {
    await rm(workDir, { recursive: true, force: true });
    throw new FeishuDocumentError('飞书文档创建失败：临时文件不在应用工作目录内');
  }
  const relativeContentPath = `@./${relativePath}`;
  try {
    await writeFile(contentPath, content, 'utf8');
    const invocation = await cliInvocation();
    const result = await execFileAsync(invocation.command, [
      ...invocation.prefixArgs,
      'docs', '+create',
      '--as', 'user',
      '--doc-format', 'markdown',
      '--title', title,
      '--content', relativeContentPath,
      '--format', 'json',
    ], {
      cwd: process.cwd(),
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const payload = parsePayload(result.stdout);
    const document = payload.data?.document;
    if (!payload.ok || !document?.document_id || !document.url) {
      throw new FeishuDocumentError(payload.error ? `飞书文档创建失败：${payload.error}` : '飞书文档创建失败：缺少文档链接');
    }
    return {
      title,
      documentId: document.document_id,
      url: document.url,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof FeishuDocumentError) throw error;
    const reason = error instanceof Error ? error.message.split('\n')[0] : '命令行调用失败';
    throw new FeishuDocumentError(`飞书文档创建失败：${reason}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
