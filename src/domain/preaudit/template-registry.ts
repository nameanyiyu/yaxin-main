import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PREAUDIT_TEMPLATE_2025_11 } from './template-2025-11';
import { PREAUDIT_TEMPLATE_2026_08 } from './template-2026-08';
import type { FixedTemplateDefinition } from './types';

const templateRecordSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  token: z.string(),
  fileName: z.string(),
  builtin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  format: z.enum(['xlsx', 'markdown']).optional(),
  definitionId: z.string().optional(),
});
const templateRecordsSchema = z.array(templateRecordSchema);

export type ManagedTemplateRecord = z.infer<typeof templateRecordSchema>;

export interface ManagedTemplateDefinition extends FixedTemplateDefinition {
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export class TemplateRegistryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TemplateRegistryError';
  }
}

interface RegistryOptions {
  idFactory?: () => string;
  now?: () => string;
}

interface CreateTemplateInput {
  name: string;
  version: string;
  token: string;
  sourceBytes?: Uint8Array;
}

interface UpdateTemplateInput {
  name?: string;
  version?: string;
}

function validateName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) {
    throw new TemplateRegistryError('INVALID_TEMPLATE', `${label}不能为空且不能超过100个字符`);
  }
  return normalized;
}

function validateToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(normalized)) {
    throw new TemplateRegistryError('INVALID_TEMPLATE_TOKEN', '销售链接标识仅支持3至64位小写字母、数字和连字符');
  }
  return normalized;
}

function builtinRecord(now: string): ManagedTemplateRecord {
  return {
    id: PREAUDIT_TEMPLATE_2025_11.id,
    version: PREAUDIT_TEMPLATE_2025_11.version,
    name: PREAUDIT_TEMPLATE_2025_11.name,
    token: PREAUDIT_TEMPLATE_2025_11.token,
    fileName: PREAUDIT_TEMPLATE_2025_11.fileName,
    builtin: true,
    createdAt: now,
    updatedAt: now,
  };
}

function toDefinition(record: ManagedTemplateRecord): ManagedTemplateDefinition {
  const base = record.definitionId === PREAUDIT_TEMPLATE_2026_08.id || record.version === PREAUDIT_TEMPLATE_2026_08.version
    ? PREAUDIT_TEMPLATE_2026_08
    : PREAUDIT_TEMPLATE_2025_11;
  return {
    ...base,
    ...structuredClone(record),
    fields: structuredClone(base.fields),
    anchors: structuredClone(base.anchors),
    riskCells: structuredClone(base.riskCells),
    format: record.format ?? base.format ?? 'xlsx',
  };
}

export class FileTemplateRegistry {
  private readonly stateFile: string;
  private readonly temporaryFile: string;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private records = new Map<string, ManagedTemplateRecord>();
  private initialized = false;
  private writeQueue = Promise.resolve();

  constructor(
    private readonly stateDirectory: string,
    private readonly templateDirectory: string,
    options: RegistryOptions = {},
  ) {
    this.stateFile = path.join(stateDirectory, 'templates.json');
    this.temporaryFile = path.join(stateDirectory, 'templates.json.tmp');
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.stateDirectory, { recursive: true }),
      mkdir(this.templateDirectory, { recursive: true }),
    ]);
    let records: ManagedTemplateRecord[] = [];
    try {
      records = templateRecordsSchema.parse(JSON.parse(await readFile(this.stateFile, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!records.some((record) => record.id === PREAUDIT_TEMPLATE_2025_11.id)) {
      records.unshift(builtinRecord(this.now()));
    }
    this.records = new Map(records.map((record) => [record.id, structuredClone(record)]));
    this.initialized = true;
    await this.persist();
  }

  async list(): Promise<ManagedTemplateDefinition[]> {
    this.assertInitialized();
    return [...this.records.values()]
      .sort((left, right) => Number(right.builtin) - Number(left.builtin) || right.updatedAt.localeCompare(left.updatedAt))
      .map((record) => toDefinition(record));
  }

  async get(id: string): Promise<ManagedTemplateDefinition | undefined> {
    this.assertInitialized();
    const record = this.records.get(id);
    return record ? toDefinition(record) : undefined;
  }

  async getByToken(token: string): Promise<ManagedTemplateDefinition | undefined> {
    this.assertInitialized();
    const record = [...this.records.values()].find((candidate) => candidate.token === token);
    return record ? toDefinition(record) : undefined;
  }

  async create(input: CreateTemplateInput): Promise<ManagedTemplateDefinition> {
    this.assertInitialized();
    const name = validateName(input.name, '模板名称');
    const version = validateName(input.version, '模板版本');
    const token = validateToken(input.token);
    if ([...this.records.values()].some((record) => record.token === token)) {
      throw new TemplateRegistryError('TEMPLATE_TOKEN_EXISTS', '销售链接标识已存在');
    }
    const id = this.idFactory();
    const now = this.now();
    const record: ManagedTemplateRecord = {
      id,
      name,
      version,
      token,
      fileName: `template-${id}.xlsx`,
      builtin: false,
      createdAt: now,
      updatedAt: now,
    };
    const destination = path.join(this.templateDirectory, record.fileName);
    if (input.sourceBytes) {
      await writeFile(destination, input.sourceBytes);
    } else {
      await copyFile(
        path.join(this.templateDirectory, PREAUDIT_TEMPLATE_2025_11.fileName),
        destination,
      );
    }
    this.records.set(id, record);
    try {
      await this.persistQueued();
      return toDefinition(record);
    } catch (error) {
      this.records.delete(id);
      await rm(destination, { force: true });
      throw error;
    }
  }

  async update(id: string, input: UpdateTemplateInput): Promise<ManagedTemplateDefinition> {
    this.assertInitialized();
    const current = this.records.get(id);
    if (!current) throw new TemplateRegistryError('TEMPLATE_NOT_FOUND', '审批模板不存在');
    if (current.builtin) {
      throw new TemplateRegistryError('BUILTIN_TEMPLATE_IMMUTABLE', '内置模板不能编辑');
    }
    const updated: ManagedTemplateRecord = {
      ...current,
      name: input.name === undefined ? current.name : validateName(input.name, '模板名称'),
      version: input.version === undefined ? current.version : validateName(input.version, '模板版本'),
      updatedAt: this.now(),
    };
    this.records.set(id, updated);
    await this.persistQueued();
    return toDefinition(updated);
  }

  async delete(id: string): Promise<boolean> {
    this.assertInitialized();
    const current = this.records.get(id);
    if (!current) return false;
    if (current.builtin) {
      throw new TemplateRegistryError('BUILTIN_TEMPLATE_IMMUTABLE', '内置模板不能删除');
    }
    this.records.delete(id);
    try {
      await this.persistQueued();
      await rm(path.join(this.templateDirectory, current.fileName), { force: true });
      return true;
    } catch (error) {
      this.records.set(id, current);
      throw error;
    }
  }

  templatePath(template: Pick<ManagedTemplateRecord, 'fileName'>): string {
    return path.join(this.templateDirectory, template.fileName);
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('TEMPLATE_REGISTRY_NOT_INITIALIZED');
  }

  private async persistQueued(): Promise<void> {
    const operation = this.writeQueue.catch(() => undefined).then(() => this.persist());
    this.writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  private async persist(): Promise<void> {
    await writeFile(this.temporaryFile, `${JSON.stringify([...this.records.values()], null, 2)}\n`, 'utf8');
    await rename(this.temporaryFile, this.stateFile);
  }
}
