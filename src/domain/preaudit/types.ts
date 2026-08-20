export type FieldValue = string | number | boolean;

export type FieldType =
  | 'text'
  | 'number'
  | 'percentage'
  | 'amount'
  | 'boolean'
  | 'rating'
  | 'date';

export interface ConditionDefinition {
  field: string;
  equals: FieldValue;
}

export interface TemplateFieldDefinition {
  key: string;
  label: string;
  section: string;
  type: FieldType;
  required: boolean;
  requiredWhen?: ConditionDefinition;
  question: string;
  followUp?: string;
  guidance?: string;
  targetCells: string[];
}

export interface FixedTemplateDefinition {
  id: string;
  version: string;
  name: string;
  token: string;
  fileName: string;
  sheetName: string;
  format?: 'xlsx' | 'markdown';
  anchors: Record<string, string>;
  riskCells: Record<string, string>;
  fields: TemplateFieldDefinition[];
}

export type ProjectStatus =
  | 'interviewing'
  | 'preaudit_needs_input'
  | 'pending_review'
  | 'reviewed'
  | 'pending_manual_submission'
  | 'pending_external_decision'
  | 'conditional_admission'
  | 'tracking'
  | 'rejected'
  | 'tracking_completed'
  | 'archived';

export interface FieldAnswer {
  value: FieldValue;
  source: 'sales' | 'reviewer' | 'system' | 'agent';
  updatedAt: string;
  confidence?: number;
  confirmationStatus?: 'confirmed' | 'needs_confirmation' | 'backend_verification';
}

export type ConversationPhase =
  | 'project_report'
  | 'information_confirmation'
  | 'risk_review'
  | 'commitments'
  | 'submitted';

export interface ProjectConversationState {
  phase: ConversationPhase;
  askedTopicIds: string[];
  notifiedRiskIds: string[];
  summaryConfirmedAt?: string;
  risksAcknowledgedAt?: string;
  submittedAt?: string;
}

export interface InterviewMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  fieldKey?: string;
}

export interface RiskFinding {
  ruleId: string;
  category: 'sales' | 'procurement';
  title: string;
  triggered: boolean;
  severity: 'blocking' | 'high' | 'medium';
  controlLevel?: 'absolute' | 'principle' | 'approval';
  controlRequirement?: string;
  reason: string;
  impact: string;
  evidenceKeys: string[];
  missingKeys: string[];
  followUpQuestions: string[];
  source?: 'rule_engine' | 'ai';
  confidence?: number;
  requiresHumanReview?: boolean;
}

export interface AiRiskAssessment {
  ruleId: string;
  result: 'triggered' | 'clear';
  confidence: number;
  reason: string;
  evidenceKeys: string[];
  updatedAt: string;
}

export interface ProjectNarratives {
  projectOverview?: string;
  significance?: string;
  controls?: string;
  commitments?: string;
}

export interface ReviewDecision {
  reviewerName: string;
  comments: string;
  reviewedAt: string;
  fieldChanges?: Array<{
    fieldKey: string;
    previousValue?: FieldValue;
    value: FieldValue;
  }>;
}

export interface FeishuDocumentReference {
  title: string;
  documentId: string;
  url: string;
  createdAt: string;
}

export interface ExternalSubmissionRecord {
  externalReference?: string;
  note?: string;
  archivedAt: string;
}

export type ApprovalDecision = 'approved' | 'rejected' | 'conditional';
export type ConditionVerificationResult = 'pending' | 'fulfilled' | 'failed';
export type TrackingStatus = 'not_started' | 'in_progress' | 'completed';
export type TrackingFieldValue = string | number | boolean | null;
export type ExecutionHealth = 'normal' | 'breached' | 'at_risk';
export type CompletionOutcome = 'achieved' | 'not_achieved';

export interface ExternalApprovalEvent {
  id: string;
  action: 'recorded' | 'condition_fulfilled' | 'condition_failed' | 'corrected' | 'migrated';
  decision: ApprovalDecision;
  operator: string;
  comments?: string;
  specialApprovalItems?: string;
  at: string;
}

export interface ExternalApprovalDecision {
  decision: ApprovalDecision;
  decisionDate: string;
  externalReference?: string;
  comments?: string;
  specialApprovalItems?: string;
  conditionalReason?: string;
  conditions?: string;
  verification?: {
    result: ConditionVerificationResult;
    comments?: string;
    verifiedBy?: string;
    verifiedAt?: string;
  };
  recordedBy: string;
  recordedAt: string;
  history: ExternalApprovalEvent[];
}

export interface ProjectTrackingSnapshot {
  id: string;
  effectiveDate: string;
  source: 'manual' | 'excel_import' | 'migration';
  executionHealth?: ExecutionHealth;
  executionHealthReason?: string;
  values: Record<string, TrackingFieldValue>;
  importBatchId?: string;
  contentFingerprint: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface ProjectTrackingLedger {
  status: TrackingStatus;
  currentSnapshotId?: string;
  snapshots: ProjectTrackingSnapshot[];
  completedBy?: string;
  completionNote?: string;
  completionOutcome?: CompletionOutcome;
  completionOutcomeReason?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreauditProject {
  id: string;
  templateVersion: string;
  token: string;
  salesName: string;
  status: ProjectStatus;
  answers: Record<string, FieldAnswer>;
  messages: InterviewMessage[];
  risks: RiskFinding[];
  aiRiskAssessments?: AiRiskAssessment[];
  conversationState?: ProjectConversationState;
  narratives: ProjectNarratives;
  review?: ReviewDecision;
  feishuDocument?: FeishuDocumentReference;
  externalSubmission?: ExternalSubmissionRecord;
  externalApproval?: ExternalApprovalDecision;
  tracking?: ProjectTrackingLedger;
  createdAt: string;
  updatedAt: string;
}
