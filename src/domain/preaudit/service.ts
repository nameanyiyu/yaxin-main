import { randomUUID } from 'node:crypto';
import {
  buildExternalApproval,
  createEmptyTrackingLedger,
  verifyConditionalApproval,
  type RecordExternalApprovalInput,
  type VerifyAdmissionConditionInput,
} from './external-approval';
import { isReadyForReview } from './interview';
import {
  conversationState,
  defaultConversationState,
  getCommitmentGaps,
  getMissingSalesReviewFields,
  isSalesReadyForReview,
  riskRuleAppliesToProject,
  unresolvedSalesRiskKeys,
} from './reporting-flow';
import type { PreauditRepository } from './repository';
import { evaluateRisks } from './risk-engine';
import { getRuntimeRiskConfiguration, type RiskRuleConfig } from './risk-config';
import { assertTransition } from './state-machine';
import {
  buildTrackingSnapshot,
  TrackingServiceError,
  type CompleteTrackingInput,
  type CreateTrackingSnapshotInput,
} from './tracking-service';
import { getTemplateDefinition } from './template';
import { resolveOrganization, type OrganizationNode } from './organization-config';
import type {
  AiRiskAssessment,
  FieldValue,
  InterviewMessage,
  PreauditProject,
  ProjectStatus,
  RiskFinding,
  FeishuDocumentReference,
  TemplateFieldDefinition,
} from './types';

export class PreauditServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PreauditServiceError';
  }
}

interface ServiceOptions {
  idFactory?: () => string;
  now?: () => string;
  organizationProvider?: () => Promise<OrganizationNode[]>;
}

interface AdminProjectInput {
  salesName: string;
  contractName: string;
  token: string;
  templateVersion: string;
  status?: ProjectStatus;
}

interface AdminProjectUpdate {
  salesName?: string;
  contractName?: string;
  status?: ProjectStatus;
}

interface SalesIdentityInput {
  salesBu: string;
  salesRegion: string;
  opportunitySerialNumber?: string;
  startMode?: 'new' | 'resume';
}

interface AnswerUpdateMetadata {
  confidenceByKey?: Record<string, number | undefined>;
  confirmationStatus?: 'confirmed' | 'needs_confirmation' | 'backend_verification';
}

function answerValues(project: PreauditProject): Record<string, unknown> {
  return Object.fromEntries(Object.entries(project.answers).map(([key, answer]) => [key, answer.value]));
}

function validateValue(field: TemplateFieldDefinition, value: unknown): FieldValue {
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
  } else if (['number', 'amount', 'percentage'].includes(field.type)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      if (field.type !== 'percentage' || value <= 100) return value;
    }
  } else if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim();
    if (field.key === 'chainLevel') {
      if (/^(direct|直签|直接签约)$/i.test(normalized)) return 'direct';
      if (/^(first_subcontractor|一级分包|一层分包)$/i.test(normalized)) return 'first_subcontractor';
      if (/^(downstream_subcontractor|二级.*分包|多级分包|下级分包)$/i.test(normalized)) {
        return 'downstream_subcontractor';
      }
    }
    return normalized;
  }
  throw new PreauditServiceError('INVALID_FIELD_VALUE', `字段 ${field.label} 的值无效`);
}

const NARRATIVE_GROUPS = {
  projectOverview: ['opportunitySource', 'projectBackground', 'contractChainProgress', 'fundingStatus', 'commercialTerms', 'amountMarginRecognition', 'historicalCooperation'],
  significance: ['strategicAlignment', 'productCapability', 'projectContinuity'],
  controls: ['contractRiskControl', 'deliveryRiskControl', 'collectionRiskControl', 'otherRiskControl'],
  commitments: ['divisionCommitment', 'collectionCommitment', 'deliveryCommitment', 'marginCommitment', 'supplierCommitment', 'newOpportunityCommitment', 'otherCommitment'],
} as const;

function refreshNarratives(project: PreauditProject): void {
  for (const [group, keys] of Object.entries(NARRATIVE_GROUPS)) {
    const content = keys
      .map((key) => project.answers[key]?.value)
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .join('\n');
    if (content) project.narratives[group as keyof PreauditProject['narratives']] = content;
    else delete project.narratives[group as keyof PreauditProject['narratives']];
  }
}

function appliesToProject(rule: RiskRuleConfig, project: PreauditProject): boolean {
  return riskRuleAppliesToProject(rule, project);
}

function aiFinding(rule: RiskRuleConfig, assessment: AiRiskAssessment): RiskFinding {
  return {
    ruleId: rule.id,
    category: rule.category === '供应商资信' ? 'procurement' : 'sales',
    title: rule.name?.trim() || rule.riskPoint,
    triggered: true,
    severity: rule.level === 'absolute' ? 'blocking' : rule.level === 'principle' ? 'high' : 'medium',
    controlLevel: rule.level,
    controlRequirement: rule.requirement,
    reason: `AI 根据销售回答识别：${assessment.reason}`,
    impact: rule.requirement || '请按配置的管理要求处理。',
    evidenceKeys: assessment.evidenceKeys,
    missingKeys: [],
    followUpQuestions: [],
    source: 'ai',
    confidence: assessment.confidence,
    requiresHumanReview: true,
  };
}

function recomputeProjectRisks(project: PreauditProject): RiskFinding[] {
  const deterministic = evaluateRisks(answerValues(project), { templateVersion: project.templateVersion });
  const rules = new Map(getRuntimeRiskConfiguration().rules.map((rule) => [rule.id, rule]));
  for (const assessment of project.aiRiskAssessments ?? []) {
    if (assessment.result !== 'triggered') continue;
    const rule = rules.get(assessment.ruleId);
    if (!rule || rule.status === 'disabled' || !appliesToProject(rule, project)) continue;
    const finding = aiFinding(rule, assessment);
    const existingIndex = deterministic.findIndex((candidate) => candidate.ruleId === rule.id);
    if (existingIndex < 0) deterministic.push(finding);
    else if (!deterministic[existingIndex].triggered) deterministic[existingIndex] = finding;
  }
  return deterministic;
}

export class PreauditService {
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly organizationProvider?: () => Promise<OrganizationNode[]>;

  constructor(
    private readonly repository: PreauditRepository,
    options: ServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.organizationProvider = options.organizationProvider;
  }

  async listProjects(filters?: { status?: ProjectStatus; token?: string }): Promise<PreauditProject[]> {
    return this.repository.listProjects(filters);
  }

  async getProject(id: string): Promise<PreauditProject> {
    const project = await this.repository.getProject(id);
    if (!project) throw new PreauditServiceError('PROJECT_NOT_FOUND', '项目不存在');
    return project;
  }

  async getProjectForExport(id: string): Promise<PreauditProject> {
    const project = await this.getProject(id);
    if (!['reviewed', 'pending_manual_submission'].includes(project.status)) {
      throw new PreauditServiceError('PROJECT_NOT_EXPORTABLE', '项目完成后台复核后才能导出');
    }
    return project;
  }

  async createAdminProject(input: AdminProjectInput): Promise<PreauditProject> {
    const salesName = input.salesName.trim();
    const contractName = input.contractName.trim();
    const token = input.token.trim();
    const templateVersion = input.templateVersion.trim();
    if (!salesName || !contractName || !token || !templateVersion) {
      throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '项目名称、销售姓名和审批模板不能为空');
    }
    const id = this.idFactory();
    return this.runMutation(id, async () => {
      const now = this.now();
      const project: PreauditProject = {
        id,
        templateVersion,
        token,
        salesName,
        status: input.status ?? 'interviewing',
        answers: {
          contractName: { value: contractName, source: 'reviewer', updatedAt: now },
        },
        messages: [],
        risks: evaluateRisks({ contractName }, { templateVersion }),
        conversationState: defaultConversationState(),
        narratives: {},
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.saveProject(project);
      return project;
    });
  }

  async updateAdminProject(id: string, input: AdminProjectUpdate): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (input.salesName !== undefined) {
        const salesName = input.salesName.trim();
        if (!salesName) throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '销售姓名不能为空');
        project.salesName = salesName;
      }
      if (input.contractName !== undefined) {
        const contractName = input.contractName.trim();
        if (!contractName) throw new PreauditServiceError('INVALID_ADMIN_PROJECT', '项目名称不能为空');
        project.answers.contractName = {
          value: contractName,
          source: 'reviewer',
          updatedAt: this.now(),
        };
      }
      if (input.status !== undefined) project.status = input.status;
      refreshNarratives(project);
      project.risks = recomputeProjectRisks(project);
      this.refreshTriggeredControlPoints(project);
      project.updatedAt = this.now();
      await this.repository.saveProject(project);
      return project;
    });
  }

  async deleteProject(id: string): Promise<void> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (project.externalApproval || project.tracking) {
        throw new PreauditServiceError(
          'PROJECT_HAS_AUDIT_HISTORY',
          '项目已有审批或跟踪记录，不能直接删除',
        );
      }
      if (!await this.repository.deleteProject(id)) {
        throw new PreauditServiceError('PROJECT_NOT_FOUND', '项目不存在');
      }
    });
  }

  async startProject(
    token: string,
    salesName: string,
    template?: { token: string; version: string },
    identity?: SalesIdentityInput,
  ): Promise<{ project: PreauditProject; resumed: boolean }> {
    const selectedTemplate = getTemplateDefinition(token).token === token
      ? getTemplateDefinition(token)
      : template;
    if (!selectedTemplate || selectedTemplate.token !== token) {
      throw new PreauditServiceError('INVALID_TEMPLATE_TOKEN', '模板分享链接无效');
    }
    const normalizedName = salesName.trim();
    if (!normalizedName) throw new PreauditServiceError('INVALID_SALES_NAME', '请填写销售姓名');
    const salesBu = identity?.salesBu.trim() ?? '';
    const salesRegion = identity?.salesRegion.trim() ?? '';
    const opportunitySerialNumber = identity?.opportunitySerialNumber?.trim();
    const startMode = identity?.startMode ?? 'resume';
    if (identity && !salesBu) throw new PreauditServiceError('INVALID_SALES_BU', '请填写销售 BU');
    if (identity && !salesRegion) throw new PreauditServiceError('INVALID_SALES_REGION', '请填写销售区域');
    const organization = identity && this.organizationProvider
      ? resolveOrganization(await this.organizationProvider(), salesBu, salesRegion)
      : undefined;
    if (identity && this.organizationProvider && !organization?.region) {
      throw new PreauditServiceError(
        'INVALID_SALES_ORGANIZATION',
        '销售 BU 与销售区域不在当前有效配置中，请重新选择',
      );
    }

    const startKey = `start:${JSON.stringify([token, normalizedName, opportunitySerialNumber ?? '', startMode])}`;
    return this.runMutation(startKey, async () => {
      const active = startMode === 'resume'
        ? await this.repository.findActiveProject(token, normalizedName, opportunitySerialNumber)
        : undefined;
      const now = this.now();
      const identityAnswers = {
        salesManager: { value: normalizedName, source: 'sales' as const, updatedAt: now },
        ...(organization ? { salesBg: { value: organization.bg.name, source: 'sales' as const, updatedAt: now } } : {}),
        ...(salesBu ? { salesBu: { value: salesBu, source: 'sales' as const, updatedAt: now } } : {}),
        ...(salesRegion ? { salesRegion: { value: salesRegion, source: 'sales' as const, updatedAt: now } } : {}),
        ...(opportunitySerialNumber
          ? { opportunitySerialNumber: { value: opportunitySerialNumber, source: 'sales' as const, updatedAt: now } }
          : {}),
      };
      if (active) {
        active.answers = { ...active.answers, ...identityAnswers };
        active.updatedAt = now;
        await this.repository.saveProject(active);
        return { project: active, resumed: true };
      }

      const project: PreauditProject = {
        id: this.idFactory(),
        templateVersion: selectedTemplate.version,
        token,
        salesName: normalizedName,
        status: 'interviewing',
        answers: identityAnswers,
        messages: [],
        risks: evaluateRisks(Object.fromEntries(
          Object.entries(identityAnswers).map(([key, answer]) => [key, answer.value]),
        ), { templateVersion: selectedTemplate.version }),
        conversationState: defaultConversationState(),
        narratives: {},
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.saveProject(project);
      return { project, resumed: false };
    });
  }

  async updateAnswers(
    id: string,
    values: Record<string, unknown>,
    source: 'sales' | 'reviewer' | 'system' | 'agent',
    metadata: AnswerUpdateMetadata = {},
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
    const project = await this.getProject(id);
    const editableStatuses: ProjectStatus[] = source === 'sales' || source === 'agent'
      ? ['interviewing', 'preaudit_needs_input']
      : ['interviewing', 'preaudit_needs_input', 'pending_review'];
    if (!editableStatuses.includes(project.status)) {
      throw new PreauditServiceError('PROJECT_NOT_EDITABLE', '项目已进入复核后续流程，字段不可再修改');
    }
    this.applyValues(project, values, source, metadata);
    this.refreshConversationAfterAnswerUpdate(project, Object.keys(values));
    this.refreshDivisionCommitment(project);
    refreshNarratives(project);
    project.risks = recomputeProjectRisks(project);
    this.refreshTriggeredControlPoints(project);
    project.updatedAt = this.now();
    await this.repository.saveProject(project);
    return project;
    });
  }

  async appendMessage(id: string, message: InterviewMessage): Promise<void> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (project.messages.some((existing) => existing.id === message.id)) return;
      project.messages.push(structuredClone(message));
      project.updatedAt = this.now();
      await this.repository.saveProject(project);
    });
  }

  async updateAiRiskAssessments(
    id: string,
    assessments: Array<Omit<AiRiskAssessment, 'updatedAt'>>,
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (!['interviewing', 'preaudit_needs_input'].includes(project.status)) {
        throw new PreauditServiceError('PROJECT_NOT_EDITABLE', '项目已进入复核流程，AI 风险判断不可再修改');
      }
      const templateKeys = new Set(getTemplateDefinition({ version: project.templateVersion, token: project.token }).fields.map((field) => field.key));
      const rules = new Map(
        getRuntimeRiskConfiguration().rules
          .filter((rule) => rule.status !== 'disabled' && appliesToProject(rule, project))
          .map((rule) => [rule.id, rule]),
      );
      const now = this.now();
      const previous = new Map((project.aiRiskAssessments ?? []).map((assessment) => [assessment.ruleId, assessment]));
      for (const assessment of assessments) {
        if (!rules.has(assessment.ruleId)) continue;
        if (!Number.isFinite(assessment.confidence) || assessment.confidence < 0 || assessment.confidence > 1) continue;
        const reason = assessment.reason.trim();
        if (!reason) continue;
        previous.set(assessment.ruleId, {
          ...assessment,
          reason,
          evidenceKeys: [...new Set(assessment.evidenceKeys.filter((key) => templateKeys.has(key)))],
          updatedAt: now,
        });
      }
      project.aiRiskAssessments = [...previous.values()];
      project.risks = recomputeProjectRisks(project);
      this.refreshTriggeredControlPoints(project);
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async recordInterviewBatch(
    id: string,
    topicIds: string[],
    notifiedRiskIds: string[],
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      const state = conversationState(project);
      project.conversationState = {
        ...state,
        askedTopicIds: [...new Set([...state.askedTopicIds, ...topicIds])],
        notifiedRiskIds: [...new Set([...state.notifiedRiskIds, ...notifiedRiskIds])],
      };
      project.updatedAt = this.now();
      await this.repository.saveProject(project);
      return project;
    });
  }

  async confirmReportSummary(id: string): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (!['interviewing', 'preaudit_needs_input'].includes(project.status)) {
        throw new PreauditServiceError('PROJECT_NOT_EDITABLE', '项目已进入复核流程，不能重复确认汇报卡');
      }
      const missing = getMissingSalesReviewFields(project).filter(
        (field) => !['control', 'commitment'].includes(field.section)
          && !['divisionCommitment', 'triggeredControlPoints'].includes(field.key),
      );
      if (missing.length) {
        throw new PreauditServiceError('INCOMPLETE_REPORT', `项目汇报仍缺少：${missing.map((field) => field.label).join('、')}`);
      }
      const now = this.now();
      for (const answer of Object.values(project.answers)) {
        if (answer.source === 'sales' || answer.source === 'agent') answer.confirmationStatus = 'confirmed';
      }
      const state = conversationState(project);
      project.conversationState = { ...state, phase: 'risk_review', summaryConfirmedAt: now };
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async acknowledgeRisks(id: string): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      const state = conversationState(project);
      if (!state.summaryConfirmedAt) {
        throw new PreauditServiceError('SUMMARY_NOT_CONFIRMED', '请先确认项目信息汇报卡');
      }
      const now = this.now();
      project.conversationState = { ...state, phase: 'commitments', risksAcknowledgedAt: now };
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async prepareReview(id: string): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
    const project = await this.getProject(id);
    if (project.status === 'pending_review') return project;
    project.risks = recomputeProjectRisks(project);
    this.refreshTriggeredControlPoints(project);
    if (!isSalesReadyForReview(project)) {
      if (project.status === 'interviewing') {
        assertTransition(project.status, 'preaudit_needs_input');
        project.status = 'preaudit_needs_input';
      }
      project.updatedAt = this.now();
      await this.repository.saveProject(project);
      const missing = getMissingSalesReviewFields(project).map((field) => field.label);
      const commitmentGaps = getCommitmentGaps(project).map((gap) => gap.fieldKey);
      const riskKeys = unresolvedSalesRiskKeys(project);
      const details = [...new Set([...missing, ...commitmentGaps, ...riskKeys])];
      throw new PreauditServiceError(
        'INCOMPLETE_PROJECT',
        details.length ? `销售侧信息或项目承诺尚未完整：${details.join('、')}` : '销售侧信息或项目承诺尚未完整',
      );
    }
    assertTransition(project.status, 'pending_review');
    project.status = 'pending_review';
    const now = this.now();
    for (const answer of Object.values(project.answers)) {
      if (answer.confirmationStatus === 'needs_confirmation') answer.confirmationStatus = 'confirmed';
    }
    project.conversationState = { ...conversationState(project), phase: 'submitted', submittedAt: now };
    project.updatedAt = now;
    await this.repository.saveProject(project);
    return project;
    });
  }

  async review(
    id: string,
    input: { reviewerName: string; comments: string; answerUpdates?: Record<string, unknown> },
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
    const project = await this.getProject(id);
    const reviewerName = input.reviewerName.trim();
    const comments = input.comments.trim();
    if (!reviewerName || !comments) {
      throw new PreauditServiceError('INVALID_REVIEW', '复核人和复核意见不能为空');
    }
    assertTransition(project.status, 'reviewed');
    const previousAnswers = structuredClone(project.answers);
    const changedUpdates = input.answerUpdates
      ? Object.fromEntries(Object.entries(input.answerUpdates).filter(
          ([key, value]) => project.answers[key]?.value !== value,
        ))
      : {};
    if (Object.keys(changedUpdates).length) this.applyValues(project, changedUpdates, 'reviewer');
    project.risks = recomputeProjectRisks(project);
    this.refreshTriggeredControlPoints(project);
    refreshNarratives(project);
    if (!isReadyForReview(project)) {
      throw new PreauditServiceError('INCOMPLETE_PROJECT', '复核修订引入了新的必填项或风险证据缺项');
    }
    const fieldChanges = Object.keys(changedUpdates).flatMap((fieldKey) => {
      const answer = project.answers[fieldKey];
      if (!answer || previousAnswers[fieldKey]?.value === answer.value) return [];
      return [{
        fieldKey,
        ...(previousAnswers[fieldKey] ? { previousValue: previousAnswers[fieldKey].value } : {}),
        value: answer.value,
      }];
    });
    project.review = {
      reviewerName,
      comments,
      reviewedAt: this.now(),
      ...(fieldChanges.length ? { fieldChanges } : {}),
    };
    project.status = 'reviewed';
    project.updatedAt = this.now();
    await this.repository.saveProject(project);
    return project;
    });
  }

  async markManualSubmission(id: string): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
    const project = await this.getProject(id);
    if (project.status === 'pending_manual_submission') return project;
    assertTransition(project.status, 'pending_manual_submission');
    project.status = 'pending_manual_submission';
    project.updatedAt = this.now();
    await this.repository.saveProject(project);
    return project;
    });
  }

  async recordFeishuDocument(id: string, reference: FeishuDocumentReference): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (!['reviewed', 'pending_manual_submission'].includes(project.status)) {
        throw new PreauditServiceError('PROJECT_NOT_EXPORTABLE', '项目完成后台复核后才能生成飞书文档');
      }
      project.feishuDocument = { ...reference };
      project.updatedAt = this.now();
      await this.repository.saveProject(project);
      return project;
    });
  }

  async archive(
    id: string,
    input: { externalReference?: string; note?: string },
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
    const project = await this.getProject(id);
    assertTransition(project.status, 'pending_external_decision');
    project.status = 'pending_external_decision';
    project.externalSubmission = {
      externalReference: input.externalReference?.trim() || undefined,
      note: input.note?.trim() || undefined,
      archivedAt: this.now(),
    };
    project.updatedAt = this.now();
    await this.repository.saveProject(project);
    return project;
    });
  }

  async recordExternalApproval(
    id: string,
    input: RecordExternalApprovalInput,
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      const now = this.now();
      const approval = buildExternalApproval(input, now, this.idFactory());
      const nextStatus: ProjectStatus = approval.decision === 'approved'
        ? 'tracking'
        : approval.decision === 'conditional'
          ? 'conditional_admission'
          : 'rejected';
      assertTransition(project.status, nextStatus);
      project.externalApproval = approval;
      project.status = nextStatus;
      if (nextStatus === 'tracking') project.tracking = createEmptyTrackingLedger(now);
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async verifyAdmissionCondition(
    id: string,
    input: VerifyAdmissionConditionInput,
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (!project.externalApproval) {
        throw new PreauditServiceError('INVALID_EXTERNAL_APPROVAL', '项目尚未记录外部审批结果');
      }
      const now = this.now();
      const approval = verifyConditionalApproval(
        project.externalApproval,
        input,
        now,
        this.idFactory(),
      );
      const nextStatus: ProjectStatus = approval.decision === 'approved' ? 'tracking' : 'rejected';
      assertTransition(project.status, nextStatus);
      project.externalApproval = approval;
      project.status = nextStatus;
      if (nextStatus === 'tracking') project.tracking = createEmptyTrackingLedger(now);
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async createTrackingSnapshot(
    id: string,
    input: CreateTrackingSnapshotInput,
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      const now = this.now();
      const result = buildTrackingSnapshot(project, input, this.idFactory(), now);
      if (result.duplicate || !result.snapshot) return project;
      if (!project.tracking) {
        throw new TrackingServiceError('TRACKING_NOT_AVAILABLE', '当前项目尚未建立跟踪台账');
      }
      project.tracking.snapshots.push(result.snapshot);
      project.tracking.currentSnapshotId = result.snapshot.id;
      project.tracking.status = 'in_progress';
      project.tracking.updatedAt = now;
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  async completeTracking(
    id: string,
    input: CompleteTrackingInput,
  ): Promise<PreauditProject> {
    return this.runMutation(id, async () => {
      const project = await this.getProject(id);
      if (project.status !== 'tracking' || !project.tracking || project.tracking.snapshots.length === 0) {
        throw new TrackingServiceError('TRACKING_NOT_AVAILABLE', '至少提交一期跟踪记录后才能结束跟踪');
      }
      const completedBy = input.completedBy.trim();
      const note = input.note.trim();
      if (!completedBy || !note) {
        throw new TrackingServiceError('INVALID_TRACKING_INPUT', '跟踪结束人和结束说明不能为空');
      }
      if (!['achieved', 'not_achieved'].includes(input.completionOutcome)) {
        throw new TrackingServiceError('INVALID_TRACKING_INPUT', '请选择承诺达成结论');
      }
      const completionOutcomeReason = input.completionOutcomeReason?.trim() || undefined;
      if (input.completionOutcome === 'not_achieved' && !completionOutcomeReason) {
        throw new TrackingServiceError('INVALID_TRACKING_INPUT', '承诺未达成时，请填写未达成原因');
      }
      assertTransition(project.status, 'tracking_completed');
      const now = this.now();
      project.status = 'tracking_completed';
      project.tracking.status = 'completed';
      project.tracking.completedBy = completedBy;
      project.tracking.completionNote = note;
      project.tracking.completionOutcome = input.completionOutcome;
      project.tracking.completionOutcomeReason = completionOutcomeReason;
      project.tracking.completedAt = now;
      project.tracking.updatedAt = now;
      project.updatedAt = now;
      await this.repository.saveProject(project);
      return project;
    });
  }

  private async runMutation<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(id) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.mutationQueues.set(id, settled);
    try {
      return await result;
    } finally {
      if (this.mutationQueues.get(id) === settled) this.mutationQueues.delete(id);
    }
  }

  private applyValues(
    project: PreauditProject,
    values: Record<string, unknown>,
    source: 'sales' | 'reviewer' | 'system' | 'agent',
    metadata: AnswerUpdateMetadata = {},
  ): void {
    const normalizedValues = { ...values };
    const updatesCustomerParty = Object.hasOwn(normalizedValues, 'customerName') || Object.hasOwn(normalizedValues, 'endUserName');
    const currentCustomerName = project.answers.customerName?.value;
    const currentEndUserName = project.answers.endUserName?.value;
    if (updatesCustomerParty && isSamePartyReference(normalizedValues.endUserName) && typeof normalizedValues.customerName === 'string') {
      normalizedValues.endUserName = normalizedValues.customerName;
    } else if (updatesCustomerParty && isSamePartyReference(normalizedValues.endUserName) && typeof currentCustomerName === 'string') {
      normalizedValues.endUserName = currentCustomerName;
    }
    if (updatesCustomerParty && isSamePartyReference(normalizedValues.customerName) && typeof normalizedValues.endUserName === 'string') {
      normalizedValues.customerName = normalizedValues.endUserName;
    } else if (updatesCustomerParty && isSamePartyReference(normalizedValues.customerName) && typeof currentEndUserName === 'string') {
      normalizedValues.customerName = currentEndUserName;
    }

    for (const [key, rawValue] of Object.entries(normalizedValues)) {
      const field = getTemplateDefinition({ version: project.templateVersion, token: project.token }).fields.find((candidate) => candidate.key === key);
      if (!field) throw new PreauditServiceError('INVALID_FIELD_VALUE', `未知字段 ${key}`);
      const confidence = metadata.confidenceByKey?.[key];
      project.answers[key] = {
        value: validateValue(field, rawValue),
        source,
        updatedAt: this.now(),
        ...(confidence === undefined ? {} : { confidence }),
        confirmationStatus: metadata.confirmationStatus
          ?? (source === 'agent' ? 'needs_confirmation' : source === 'system' ? 'backend_verification' : 'confirmed'),
      };
    }

    const customerName = project.answers.customerName?.value;
    const endUserName = project.answers.endUserName?.value;
    if (updatesCustomerParty && typeof customerName === 'string' && customerName.trim() && customerName === endUserName) {
      const updatedAt = this.now();
      const confirmationStatus = metadata.confirmationStatus
        ?? (source === 'agent' ? 'needs_confirmation' : source === 'system' ? 'backend_verification' : 'confirmed');
      project.answers.customerName = { value: customerName, source, updatedAt, confirmationStatus };
      project.answers.endUserName = { value: customerName, source, updatedAt, confirmationStatus };
    }
  }

  private refreshConversationAfterAnswerUpdate(project: PreauditProject, keys: string[]): void {
    const state = conversationState(project);
    if (!state.summaryConfirmedAt) {
      project.conversationState = state;
      return;
    }
    const postConfirmation = new Set([
      'divisionCommitment',
      'triggeredControlPoints',
      'contractRiskControl',
      'deliveryRiskControl',
      'collectionRiskControl',
      'otherRiskControl',
      'collectionCommitment',
      'deliveryCommitment',
      'marginCommitment',
      'supplierCommitment',
      'newOpportunityCommitment',
      'otherCommitment',
    ]);
    if (keys.some((key) => !postConfirmation.has(key))) {
      project.conversationState = {
        ...state,
        phase: 'project_report',
        summaryConfirmedAt: undefined,
        risksAcknowledgedAt: undefined,
      };
    }
  }

  private refreshDivisionCommitment(project: PreauditProject): void {
    if (project.templateVersion !== '2026-08') return;
    const candidates: Array<[string, unknown]> = [
      ['回款', project.answers.collectionCommitment?.value],
      ['利润', project.answers.marginCommitment?.value],
      ['交付', project.answers.deliveryCommitment?.value],
      ['新商机', project.answers.newOpportunityCommitment?.value],
      ...(project.answers.hasProcurement?.value === true
        ? [['供应商', project.answers.supplierCommitment?.value] as [string, unknown]]
        : []),
    ];
    const items = candidates.filter((item): item is [string, string] => typeof item[1] === 'string' && Boolean(item[1].trim()));
    const requiredCount = project.answers.hasProcurement?.value === true ? 5 : 4;
    if (items.length !== requiredCount) return;
    const existing = project.answers.divisionCommitment;
    if (existing && existing.source !== 'agent') return;
    project.answers.divisionCommitment = {
      value: items.map(([label, value]) => `${label}承诺：${value}`).join('\n'),
      source: 'agent',
      updatedAt: this.now(),
      confidence: 1,
      confirmationStatus: 'needs_confirmation',
    };
  }

  private refreshTriggeredControlPoints(project: PreauditProject): void {
    if (project.templateVersion !== '2026-08') return;
    const triggered = project.risks.filter((risk) => risk.triggered);
    const pending = project.risks.filter((risk) => !risk.triggered && risk.missingKeys.length > 0);
    const value = triggered.length
      ? triggered.map((risk) => `${risk.title}（${risk.controlRequirement ?? risk.impact}）`).join('\n')
      : pending.length
        ? '当前未确认命中风险，仍有系统或后台核验项待完成。'
        : '当前已填写信息未命中已启用的公司级及所属 BG 风险规则。';
    project.answers.triggeredControlPoints = {
      value,
      source: 'system',
      updatedAt: this.now(),
      confidence: 1,
      confirmationStatus: 'backend_verification',
    };
  }
}

function isSamePartyReference(value: unknown): boolean {
  return typeof value === 'string'
    && /^(相同|同上|同一家公司|与签约客户(?:名称)?一致|与最终用户(?:名称)?一致|最终用户和签约客户一致)$/i.test(value.trim());
}
