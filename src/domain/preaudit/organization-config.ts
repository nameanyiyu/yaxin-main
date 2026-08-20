import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export type OrganizationNodeType = 'bg' | 'bu' | 'region';

export interface OrganizationNode {
  id: string;
  type: OrganizationNodeType;
  name: string;
  parentId?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationNodeInput {
  type: OrganizationNodeType;
  name: string;
  parentId?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface UpdateOrganizationNodeInput {
  name?: string;
  parentId?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export const DEFAULT_BG_BU = {
  TSG: ['CMC', 'CUC', 'CTC', 'AIO'],
  DIG: ['SIO', 'AID', 'AIS'],
  SIG: ['ESU', 'SSU'],
  CSU: ['CSU'],
} as const;

const organizationNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['bg', 'bu', 'region']),
  name: z.string().min(1),
  parentId: z.string().optional(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const organizationConfigSchema = z.array(organizationNodeSchema);

export class OrganizationConfigError extends Error {
  constructor(
    readonly code: 'ORGANIZATION_CONFIG_INVALID' | 'ORGANIZATION_CONFIG_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'OrganizationConfigError';
  }
}

function normalizedName(value: string): string {
  return value.trim();
}

function slug(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function defaultOrganizationConfig(now = new Date().toISOString()): OrganizationNode[] {
  const nodes: OrganizationNode[] = [];
  Object.entries(DEFAULT_BG_BU).forEach(([bgName, bus], bgIndex) => {
    const bgId = `bg-${slug(bgName)}`;
    nodes.push({
      id: bgId,
      type: 'bg',
      name: bgName,
      enabled: true,
      sortOrder: bgIndex,
      createdAt: now,
      updatedAt: now,
    });
    bus.forEach((buName, buIndex) => {
      nodes.push({
        id: `bu-${slug(bgName)}-${slug(buName)}`,
        type: 'bu',
        name: buName,
        parentId: bgId,
        enabled: true,
        sortOrder: buIndex,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  return nodes;
}

function sorted(nodes: OrganizationNode[]): OrganizationNode[] {
  return nodes.toSorted((left, right) =>
    left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, 'zh-CN'));
}

export function enabledBus(nodes: OrganizationNode[], bgName: string): OrganizationNode[] {
  const bg = nodes.find((node) =>
    node.type === 'bg' && node.enabled && node.name.toLocaleUpperCase('en-US') === bgName.trim().toLocaleUpperCase('en-US'));
  if (!bg) return [];
  return sorted(nodes.filter((node) => node.type === 'bu' && node.enabled && node.parentId === bg.id));
}

export function resolveOrganization(
  nodes: OrganizationNode[],
  buName: string,
  regionName?: string,
): { bg: OrganizationNode; bu: OrganizationNode; region?: OrganizationNode } | undefined {
  const normalizedBu = normalizedName(buName).toLocaleLowerCase('zh-CN');
  const candidates = nodes.filter((node) =>
    node.type === 'bu'
      && node.enabled
      && node.name.toLocaleLowerCase('zh-CN') === normalizedBu);
  if (candidates.length !== 1) return undefined;
  const bu = candidates[0];
  const bg = nodes.find((node) => node.id === bu.parentId && node.type === 'bg' && node.enabled);
  if (!bg) return undefined;
  const normalizedRegion = normalizedName(regionName ?? '');
  if (!normalizedRegion) return { bg, bu };
  const region = nodes.find((node) =>
    node.type === 'region'
      && node.enabled
      && node.parentId === bu.id
      && node.name.toLocaleLowerCase('zh-CN') === normalizedRegion.toLocaleLowerCase('zh-CN'));
  return region ? { bg, bu, region } : undefined;
}

function expectedParentType(type: OrganizationNodeType): OrganizationNodeType | undefined {
  if (type === 'bu') return 'bg';
  if (type === 'region') return 'bu';
  return undefined;
}

export class FileOrganizationConfigRepository {
  private readonly stateFile: string;
  private readonly temporaryFile: string;
  private nodes = new Map<string, OrganizationNode>();
  private initialized = false;
  private writeQueue = Promise.resolve();

  constructor(
    private readonly dataDirectory: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = randomUUID,
  ) {
    this.stateFile = path.join(dataDirectory, 'organization-config.json');
    this.temporaryFile = path.join(dataDirectory, 'organization-config.json.tmp');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    let loaded: OrganizationNode[];
    try {
      loaded = organizationConfigSchema.parse(
        JSON.parse(await readFile(this.stateFile, 'utf8')),
      ) as OrganizationNode[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      loaded = defaultOrganizationConfig(this.now());
      await this.writeNodes(loaded);
    }
    this.nodes = new Map(loaded.map((node) => [node.id, structuredClone(node)]));
    this.initialized = true;
  }

  async list(): Promise<OrganizationNode[]> {
    this.assertInitialized();
    return sorted([...this.nodes.values()].map((node) => structuredClone(node)));
  }

  async create(input: CreateOrganizationNodeInput): Promise<OrganizationNode> {
    this.assertInitialized();
    const now = this.now();
    const node: OrganizationNode = {
      id: this.idFactory(),
      type: input.type,
      name: this.validName(input.name),
      parentId: input.parentId,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? this.nextSortOrder(input.type, input.parentId),
      createdAt: now,
      updatedAt: now,
    };
    this.validateNode(node);
    await this.persistMutation(() => this.nodes.set(node.id, structuredClone(node)));
    return structuredClone(node);
  }

  async update(id: string, input: UpdateOrganizationNodeInput): Promise<OrganizationNode> {
    this.assertInitialized();
    const current = this.nodes.get(id);
    if (!current) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_NOT_FOUND', '组织配置项不存在');
    }
    const updated: OrganizationNode = {
      ...current,
      ...(input.name === undefined ? {} : { name: this.validName(input.name) }),
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      updatedAt: this.now(),
    };
    this.validateNode(updated);
    await this.persistMutation(() => this.nodes.set(id, structuredClone(updated)));
    return structuredClone(updated);
  }

  async restoreDefaults(): Promise<OrganizationNode[]> {
    this.assertInitialized();
    const defaults = defaultOrganizationConfig(this.now());
    const additions = defaults.filter((candidate) => {
      if (candidate.type === 'bg') {
        return ![...this.nodes.values()].some((node) => node.type === 'bg' && this.sameName(node.name, candidate.name));
      }
      const defaultParent = defaults.find((node) => node.id === candidate.parentId);
      const actualParent = [...this.nodes.values()].find((node) =>
        node.type === 'bg' && defaultParent && this.sameName(node.name, defaultParent.name));
      return actualParent
        && ![...this.nodes.values()].some((node) =>
          node.type === 'bu' && node.parentId === actualParent.id && this.sameName(node.name, candidate.name));
    });
    if (additions.length === 0) return this.list();
    await this.persistMutation(() => {
      for (const candidate of additions) {
        if (candidate.type === 'bg') {
          this.nodes.set(candidate.id, candidate);
          continue;
        }
        const defaultParent = defaults.find((node) => node.id === candidate.parentId)!;
        const actualParent = [...this.nodes.values()].find((node) =>
          node.type === 'bg' && this.sameName(node.name, defaultParent.name))!;
        this.nodes.set(candidate.id, { ...candidate, parentId: actualParent.id });
      }
    });
    return this.list();
  }

  private validName(value: string): string {
    const name = normalizedName(value);
    if (!name) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '组织名称不能为空');
    }
    return name;
  }

  private validateNode(node: OrganizationNode): void {
    if (!Number.isInteger(node.sortOrder) || node.sortOrder < 0) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '排序值必须是非负整数');
    }
    const duplicate = [...this.nodes.values()].find((candidate) =>
      candidate.id !== node.id
        && candidate.type === node.type
        && candidate.parentId === node.parentId
        && this.sameName(candidate.name, node.name));
    if (duplicate) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '同一层级下已存在同名配置');
    }
    const parentType = expectedParentType(node.type);
    if (!parentType) {
      if (node.parentId) {
        throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', 'BG 不能设置父级');
      }
      return;
    }
    const parent = node.parentId ? this.nodes.get(node.parentId) : undefined;
    if (!parent || parent.type !== parentType) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '组织配置父级无效');
    }
    if (node.enabled && !this.hasEnabledAncestors(parent)) {
      throw new OrganizationConfigError('ORGANIZATION_CONFIG_INVALID', '父级停用时不能启用或新增子项');
    }
  }

  private hasEnabledAncestors(node: OrganizationNode): boolean {
    if (!node.enabled) return false;
    if (!node.parentId) return true;
    const parent = this.nodes.get(node.parentId);
    return Boolean(parent && this.hasEnabledAncestors(parent));
  }

  private sameName(left: string, right: string): boolean {
    return left.toLocaleLowerCase('zh-CN') === right.toLocaleLowerCase('zh-CN');
  }

  private nextSortOrder(type: OrganizationNodeType, parentId?: string): number {
    const siblings = [...this.nodes.values()].filter((node) =>
      node.type === type && node.parentId === parentId);
    return siblings.length === 0 ? 0 : Math.max(...siblings.map((node) => node.sortOrder)) + 1;
  }

  private async persistMutation(operation: () => void): Promise<void> {
    const previousNodes = new Map(
      [...this.nodes.entries()].map(([id, node]) => [id, structuredClone(node)]),
    );
    const queued = this.writeQueue.catch(() => undefined).then(async () => {
      operation();
      try {
        await this.writeNodes([...this.nodes.values()]);
      } catch (error) {
        this.nodes = previousNodes;
        throw error;
      }
    });
    this.writeQueue = queued.then(() => undefined, () => undefined);
    await queued;
  }

  private async writeNodes(nodes: OrganizationNode[]): Promise<void> {
    await writeFile(this.temporaryFile, `${JSON.stringify(nodes, null, 2)}\n`, 'utf8');
    await rename(this.temporaryFile, this.stateFile);
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('ORGANIZATION_CONFIG_REPOSITORY_NOT_INITIALIZED');
  }
}
