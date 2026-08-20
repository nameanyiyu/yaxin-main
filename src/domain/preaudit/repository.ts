import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { PreauditProject, ProjectStatus } from './types';

const projectStatusSchema = z.enum([
  'interviewing',
  'preaudit_needs_input',
  'pending_review',
  'reviewed',
  'pending_manual_submission',
  'pending_external_decision',
  'conditional_admission',
  'tracking',
  'rejected',
  'tracking_completed',
  'archived',
]);
const fieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const fieldAnswerSchema = z.object({
  value: fieldValueSchema,
  source: z.enum(['sales', 'reviewer', 'system', 'agent']),
  updatedAt: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  confirmationStatus: z.enum(['confirmed', 'needs_confirmation', 'backend_verification']).optional(),
});
const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.string(),
  fieldKey: z.string().optional(),
});
const riskSchema = z.object({
  ruleId: z.string(),
  category: z.enum(['sales', 'procurement']),
  title: z.string(),
  triggered: z.boolean(),
  severity: z.enum(['blocking', 'high', 'medium']),
  controlLevel: z.enum(['absolute', 'principle', 'approval']).optional(),
  controlRequirement: z.string().optional(),
  reason: z.string(),
  impact: z.string(),
  evidenceKeys: z.array(z.string()),
  missingKeys: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  source: z.enum(['rule_engine', 'ai']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  requiresHumanReview: z.boolean().optional(),
});
const aiRiskAssessmentSchema = z.object({
  ruleId: z.string(),
  result: z.enum(['triggered', 'clear']),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  evidenceKeys: z.array(z.string()),
  updatedAt: z.string(),
});
const feishuDocumentSchema = z.object({
  title: z.string(),
  documentId: z.string(),
  url: z.string(),
  createdAt: z.string(),
});
const approvalDecisionSchema = z.enum(['approved', 'rejected', 'conditional']);
const externalApprovalEventSchema = z.object({
  id: z.string(),
  action: z.enum(['recorded', 'condition_fulfilled', 'condition_failed', 'corrected', 'migrated']),
  decision: approvalDecisionSchema,
  operator: z.string(),
  comments: z.string().optional(),
  specialApprovalItems: z.string().optional(),
  at: z.string(),
});
const externalApprovalSchema = z.object({
  decision: approvalDecisionSchema,
  decisionDate: z.string(),
  externalReference: z.string().optional(),
  comments: z.string().optional(),
  specialApprovalItems: z.string().optional(),
  conditionalReason: z.string().optional(),
  conditions: z.string().optional(),
  verification: z.object({
    result: z.enum(['pending', 'fulfilled', 'failed']),
    comments: z.string().optional(),
    verifiedBy: z.string().optional(),
    verifiedAt: z.string().optional(),
  }).optional(),
  recordedBy: z.string(),
  recordedAt: z.string(),
  history: z.array(externalApprovalEventSchema),
});
const trackingFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const trackingSnapshotSchema = z.object({
  id: z.string(),
  effectiveDate: z.string(),
  source: z.enum(['manual', 'excel_import', 'migration']),
  executionHealth: z.enum(['normal', 'breached', 'at_risk']).optional(),
  executionHealthReason: z.string().optional(),
  values: z.record(z.string(), trackingFieldValueSchema),
  importBatchId: z.string().optional(),
  contentFingerprint: z.string(),
  note: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
const trackingLedgerSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
  currentSnapshotId: z.string().optional(),
  snapshots: z.array(trackingSnapshotSchema),
  completedBy: z.string().optional(),
  completionNote: z.string().optional(),
  completionOutcome: z.enum(['achieved', 'not_achieved']).optional(),
  completionOutcomeReason: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const projectSchema = z.object({
  id: z.string(),
  templateVersion: z.string(),
  token: z.string(),
  salesName: z.string(),
  status: projectStatusSchema,
  answers: z.record(z.string(), fieldAnswerSchema),
  messages: z.array(messageSchema),
  risks: z.array(riskSchema),
  aiRiskAssessments: z.array(aiRiskAssessmentSchema).optional(),
  conversationState: z.object({
    phase: z.enum(['project_report', 'information_confirmation', 'risk_review', 'commitments', 'submitted']),
    askedTopicIds: z.array(z.string()),
    notifiedRiskIds: z.array(z.string()),
    summaryConfirmedAt: z.string().optional(),
    risksAcknowledgedAt: z.string().optional(),
    submittedAt: z.string().optional(),
  }).optional(),
  narratives: z.object({
    projectOverview: z.string().optional(),
    significance: z.string().optional(),
    controls: z.string().optional(),
    commitments: z.string().optional(),
  }),
  review: z
    .object({
      reviewerName: z.string(),
      comments: z.string(),
      reviewedAt: z.string(),
      fieldChanges: z.array(z.object({
        fieldKey: z.string(),
        previousValue: fieldValueSchema.optional(),
        value: fieldValueSchema,
      })).optional(),
    })
    .optional(),
  feishuDocument: feishuDocumentSchema.optional(),
  externalSubmission: z
    .object({
      externalReference: z.string().optional(),
      note: z.string().optional(),
      archivedAt: z.string(),
    })
    .optional(),
  externalApproval: externalApprovalSchema.optional(),
  tracking: trackingLedgerSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const projectsSchema = z.array(projectSchema);

let writeQueue = Promise.resolve();

export class PreauditStateError extends Error {
  readonly code = 'PREAUDIT_STATE_INVALID';

  constructor(filePath: string, cause?: unknown) {
    super(`PREAUDIT_STATE_INVALID: 无法读取项目状态文件 ${filePath}`, { cause });
    this.name = 'PreauditStateError';
  }
}

export interface PreauditRepository {
  initialize(): Promise<void>;
  listProjects(filters?: { status?: ProjectStatus; token?: string }): Promise<PreauditProject[]>;
  getProject(id: string): Promise<PreauditProject | undefined>;
  findActiveProject(token: string, salesName: string, opportunitySerialNumber?: string): Promise<PreauditProject | undefined>;
  saveProject(project: PreauditProject): Promise<void>;
  deleteProject(id: string): Promise<boolean>;
}

export class FilePreauditRepository implements PreauditRepository {
  private readonly stateFile: string;
  private readonly temporaryFile: string;
  private projects = new Map<string, PreauditProject>();
  private initialized = false;

  constructor(private readonly dataDirectory: string) {
    this.stateFile = path.join(dataDirectory, 'projects.json');
    this.temporaryFile = path.join(dataDirectory, 'projects.json.tmp');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    let raw: string;
    try {
      raw = await readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.writeProjects([]);
      raw = '[]';
    }

    try {
      const projects = projectsSchema.parse(JSON.parse(raw)) as PreauditProject[];
      this.projects = new Map(projects.map((project) => [project.id, structuredClone(project)]));
      this.initialized = true;
    } catch (error) {
      throw new PreauditStateError(this.stateFile, error);
    }
  }

  async listProjects(filters: { status?: ProjectStatus; token?: string } = {}): Promise<PreauditProject[]> {
    this.assertInitialized();
    return [...this.projects.values()]
      .filter((project) => !filters.status || project.status === filters.status)
      .filter((project) => !filters.token || project.token === filters.token)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((project) => structuredClone(project));
  }

  async getProject(id: string): Promise<PreauditProject | undefined> {
    this.assertInitialized();
    const project = this.projects.get(id);
    return project ? structuredClone(project) : undefined;
  }

  async findActiveProject(token: string, salesName: string, opportunitySerialNumber?: string): Promise<PreauditProject | undefined> {
    this.assertInitialized();
    const project = [...this.projects.values()]
      .filter(
      (candidate) =>
        candidate.token === token &&
        candidate.salesName === salesName &&
        ['interviewing', 'preaudit_needs_input'].includes(candidate.status) &&
        (!opportunitySerialNumber || candidate.answers.opportunitySerialNumber?.value === opportunitySerialNumber),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return project ? structuredClone(project) : undefined;
  }

  async saveProject(project: PreauditProject): Promise<void> {
    this.assertInitialized();
    const validated = projectSchema.parse(project) as PreauditProject;
    const operation = writeQueue.catch(() => undefined).then(async () => {
      const previous = this.projects.get(validated.id);
      this.projects.set(validated.id, structuredClone(validated));
      try {
        await this.writeProjects([...this.projects.values()]);
      } catch (error) {
        if (previous) this.projects.set(previous.id, previous);
        else this.projects.delete(validated.id);
        throw error;
      }
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  async deleteProject(id: string): Promise<boolean> {
    this.assertInitialized();
    if (!this.projects.has(id)) return false;
    const operation = writeQueue.catch(() => undefined).then(async () => {
      const previous = this.projects.get(id);
      if (!previous) return false;
      this.projects.delete(id);
      try {
        await this.writeProjects([...this.projects.values()]);
        return true;
      } catch (error) {
        this.projects.set(id, previous);
        throw error;
      }
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('PREAUDIT_REPOSITORY_NOT_INITIALIZED');
  }

  private async writeProjects(projects: PreauditProject[]): Promise<void> {
    await writeFile(this.temporaryFile, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
    await rename(this.temporaryFile, this.stateFile);
  }
}
