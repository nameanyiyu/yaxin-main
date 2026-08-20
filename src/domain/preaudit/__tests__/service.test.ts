import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PREAUDIT_TEMPLATE_2025_11 } from '../template-2025-11';
import { PREAUDIT_TEMPLATE_2026_08 } from '../template-2026-08';
import { BACKEND_VERIFICATION_FIELD_KEYS } from '../reporting-flow';
import { FilePreauditRepository } from '../repository';
import { PreauditService } from '../service';
import type { FieldValue } from '../types';
import { defaultOrganizationConfig } from '../organization-config';

const tempDirectories: string[] = [];
let service: PreauditService;

function completeValues(overrides: Record<string, FieldValue> = {}): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {
    customerRating: 'A',
    customerCollectionHealth: 1,
    hasProcurement: false,
    chainLevel: 'direct',
    upstreamSigned: true,
    fundingPartyConfirmed: true,
    isBackToBackPayment: false,
    isQualityWhitelistCustomer: false,
    gm1: 10,
    hasChannelFee: false,
  };
  for (const field of PREAUDIT_TEMPLATE_2025_11.fields) {
    if (field.required && !(field.key in values)) {
      values[field.key] = field.type === 'boolean' ? false : field.type === 'number' || field.type === 'amount' || field.type === 'percentage' ? 1 : '已填写';
    }
  }
  return { ...values, ...overrides };
}

function complete2026SalesValues(): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of PREAUDIT_TEMPLATE_2026_08.fields) {
    if (BACKEND_VERIFICATION_FIELD_KEYS.has(field.key) || ['divisionCommitment', 'supplierCommitment'].includes(field.key)) continue;
    values[field.key] = field.type === 'boolean' ? false : ['number', 'amount', 'percentage'].includes(field.type) ? 1 : '已填写';
  }
  return {
    ...values,
    salesBg: 'DIG', hasProcurement: false, hasDirectFinancing: false, hasPotentialFinancing: false,
    isBackToBackPayment: false, chainLevel: 'direct', gm1: 10,
    collectionCommitment: '签约后首笔回款于2026年10月完成，全部回款于2027年3月完成，由销售经理负责，建立每周催收台账保障执行。',
    marginCommitment: '承诺GM1不低于10%，由项目经理负责锁定预算并每月复核成本，异常时升级事业部。',
    deliveryCommitment: '2027年2月完成交付验收，按合同验收标准执行，由交付经理负责，通过里程碑检查和资源保障推进。',
    newOpportunityCommitment: '承诺2027年6月前形成云平台扩容新商机，由销售经理负责，每月跟进客户需求并维护商机台账。',
  };
}

beforeEach(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-service-'));
  tempDirectories.push(directory);
  const repository = new FilePreauditRepository(directory);
  await repository.initialize();
  let sequence = 0;
  service = new PreauditService(repository, {
    idFactory: () => `id-${++sequence}`,
    now: () => '2026-07-22T00:00:00.000Z',
  });
});

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('PreauditService', () => {
  it('creates and resumes an active project', async () => {
    const first = await service.startProject('preaudit202511', '张三');
    const second = await service.startProject('preaudit202511', '张三');

    expect(first.resumed).toBe(false);
    expect(second.resumed).toBe(true);
    expect(second.project.id).toBe(first.project.id);
  });

  it('keeps new opportunities separate and resumes only the matching serial number', async () => {
    const first = await service.startProject('preaudit202608', '张三', undefined, {
      salesBu: 'CMC', salesRegion: '华东区', opportunitySerialNumber: 'OPP-001', startMode: 'new',
    });
    const second = await service.startProject('preaudit202608', '张三', undefined, {
      salesBu: 'CMC', salesRegion: '华东区', opportunitySerialNumber: 'OPP-002', startMode: 'new',
    });
    const resumed = await service.startProject('preaudit202608', '张三', undefined, {
      salesBu: 'CMC', salesRegion: '华东区', opportunitySerialNumber: 'OPP-001', startMode: 'resume',
    });

    expect(second.project.id).not.toBe(first.project.id);
    expect(resumed).toMatchObject({ resumed: true, project: { id: first.project.id } });
  });

  it('requires and persists the sales profile supplied by the sales entry route', async () => {
    await expect(service.startProject('preaudit202511', '张三', undefined, {
      salesBu: '',
      salesRegion: '华东区',
    })).rejects.toMatchObject({ code: 'INVALID_SALES_BU' });
    await expect(service.startProject('preaudit202511', '张三', undefined, {
      salesBu: '政企 BU',
      salesRegion: '',
    })).rejects.toMatchObject({ code: 'INVALID_SALES_REGION' });

    const { project } = await service.startProject('preaudit202511', '张三', undefined, {
      salesBu: '政企 BU',
      salesRegion: '华东区',
      opportunitySerialNumber: 'SJ-20260727-001',
    });

    expect(project.answers).toMatchObject({
      salesManager: { value: '张三', source: 'sales' },
      salesBu: { value: '政企 BU', source: 'sales' },
      salesRegion: { value: '华东区', source: 'sales' },
      opportunitySerialNumber: { value: 'SJ-20260727-001', source: 'sales' },
    });
  });

  it('derives BG and rejects invalid configured BU and region combinations', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'preaudit-service-org-'));
    tempDirectories.push(directory);
    const repository = new FilePreauditRepository(directory);
    await repository.initialize();
    const nodes = defaultOrganizationConfig('2026-07-22T00:00:00.000Z');
    const cmc = nodes.find((node) => node.type === 'bu' && node.name === 'CMC')!;
    nodes.push({
      id: 'region-east',
      type: 'region',
      name: '华东区',
      parentId: cmc.id,
      enabled: true,
      sortOrder: 0,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    });
    const configuredService = new PreauditService(repository, {
      now: () => '2026-07-22T00:00:00.000Z',
      organizationProvider: async () => nodes,
    });

    await expect(configuredService.startProject('preaudit202511', '张三', undefined, {
      salesBu: 'CMC',
      salesRegion: '不存在区域',
    })).rejects.toMatchObject({ code: 'INVALID_SALES_ORGANIZATION' });

    const { project } = await configuredService.startProject('preaudit202511', '张三', undefined, {
      salesBu: 'CMC',
      salesRegion: '华东区',
    });
    expect(project.answers).toMatchObject({
      salesBg: { value: 'TSG', source: 'sales' },
      salesBu: { value: 'CMC', source: 'sales' },
      salesRegion: { value: '华东区', source: 'sales' },
    });
  });

  it('lets an administrator create, edit, and delete a project', async () => {
    const created = await service.createAdminProject({
      salesName: '后台销售',
      contractName: '后台新建项目',
      token: 'preaudit202511',
      templateVersion: '2025-11',
    });
    expect(created).toMatchObject({
      salesName: '后台销售',
      status: 'interviewing',
      answers: { contractName: { value: '后台新建项目', source: 'reviewer' } },
    });

    const updated = await service.updateAdminProject(created.id, {
      salesName: '修改后销售',
      contractName: '修改后项目',
      status: 'preaudit_needs_input',
    });
    expect(updated).toMatchObject({
      salesName: '修改后销售',
      status: 'preaudit_needs_input',
      answers: { contractName: { value: '修改后项目', source: 'reviewer' } },
    });

    await service.deleteProject(created.id);
    await expect(service.getProject(created.id)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    await expect(service.deleteProject(created.id)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('prevents destructive deletion after approval or tracking history exists', async () => {
    const created = await service.createAdminProject({
      salesName: '后台销售',
      contractName: '已有审批记录项目',
      token: 'preaudit202511',
      templateVersion: '2025-11',
      status: 'pending_external_decision',
    });
    const approved = await service.recordExternalApproval(created.id, {
      decision: 'approved',
      decisionDate: '2026-07-29',
      specialApprovalItems: '测试特批事项',
      recordedBy: '管理员',
    });

    await expect(service.deleteProject(approved.id)).rejects.toMatchObject({
      code: 'PROJECT_HAS_AUDIT_HISTORY',
    });
    await expect(service.getProject(approved.id)).resolves.toMatchObject({ status: 'tracking' });
  });

  it('serializes concurrent starts for the same salesperson and template', async () => {
    const [first, second] = await Promise.all([
      service.startProject('preaudit202511', '张三'),
      service.startProject('preaudit202511', ' 张三 '),
    ]);

    expect(first.project.id).toBe(second.project.id);
    expect([first.resumed, second.resumed].sort()).toEqual([false, true]);
    expect(await service.listProjects()).toHaveLength(1);
  });

  it('rejects invalid tokens, fields, and values with stable error codes', async () => {
    await expect(service.startProject('wrong-token', '张三')).rejects.toMatchObject({ code: 'INVALID_TEMPLATE_TOKEN' });
    const { project } = await service.startProject('preaudit202511', '张三');
    await expect(service.updateAnswers(project.id, { unknownField: 'x' }, 'sales')).rejects.toMatchObject({
      code: 'INVALID_FIELD_VALUE',
    });
    await expect(service.updateAnswers(project.id, { gm1: '百分之五' }, 'sales')).rejects.toMatchObject({
      code: 'INVALID_FIELD_VALUE',
    });
    await expect(service.getProject('missing-project')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('validates updates and recomputes deterministic risks', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    const updated = await service.updateAnswers(project.id, { gm1: 5, chainLevel: '直签' }, 'sales');
    expect(updated.answers.gm1.value).toBe(5);
    expect(updated.answers.chainLevel.value).toBe('direct');
    expect(updated.risks.find((risk) => risk.ruleId === 'PROJECT_MARGIN')).toMatchObject({
      triggered: true,
      severity: 'blocking',
    });
  });

  it('copies one company name into both customer fields when the parties are the same', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    const updated = await service.updateAnswers(project.id, {
      customerName: '华东智算科技有限公司',
      endUserName: '同一家公司',
    }, 'sales');

    expect(updated.answers.customerName.value).toBe('华东智算科技有限公司');
    expect(updated.answers.endUserName.value).toBe('华东智算科技有限公司');
  });

  it('persists AI semantic risk assessments without letting AI change the configured level', async () => {
    const { project } = await service.startProject('preaudit202608', '张三');
    await service.updateAnswers(project.id, { salesBg: 'DIG', contractName: '测试合同' }, 'sales');

    const triggered = await service.updateAiRiskAssessments(project.id, [{
      ruleId: 'COMPANY_EMPTY_TURNOVER',
      result: 'triggered',
      confidence: 0.92,
      reason: '销售确认上下游为同一主体，且没有真实货物或服务流转',
      evidenceKeys: ['contractName'],
    }]);

    expect(triggered.aiRiskAssessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'COMPANY_EMPTY_TURNOVER', result: 'triggered' }),
    ]));
    expect(triggered.risks.find((risk) => risk.ruleId === 'COMPANY_EMPTY_TURNOVER')).toMatchObject({
      triggered: true,
      severity: 'blocking',
      controlLevel: 'absolute',
      controlRequirement: '无条件禁止签约，不接受特批。',
      source: 'ai',
      requiresHumanReview: true,
    });

    const cleared = await service.updateAiRiskAssessments(project.id, [{
      ruleId: 'COMPANY_EMPTY_TURNOVER',
      result: 'clear',
      confidence: 0.95,
      reason: '销售补充了真实交付和商业需求证明',
      evidenceKeys: ['contractName'],
    }]);
    expect(cleared.risks.some((risk) => risk.ruleId === 'COMPANY_EMPTY_TURNOVER' && risk.triggered)).toBe(false);
  });

  it('rejects review preparation while required evidence is missing', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await expect(service.prepareReview(project.id)).rejects.toMatchObject({ code: 'INCOMPLETE_PROJECT' });
    expect((await service.getProject(project.id)).status).toBe('preaudit_needs_input');
  });

  it('reviews, marks manual submission, and waits for the external decision', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await service.updateAnswers(project.id, completeValues(), 'sales');
    expect((await service.prepareReview(project.id)).status).toBe('pending_review');

    const reviewed = await service.review(project.id, {
      reviewerName: '李复核',
      comments: '同意进入人工审批',
      answerUpdates: { gm1: 12 },
    });
    expect(reviewed).toMatchObject({
      status: 'reviewed',
      review: {
        reviewerName: '李复核',
        comments: '同意进入人工审批',
        fieldChanges: [{ fieldKey: 'gm1', previousValue: 10, value: 12 }],
      },
    });
    expect(reviewed.answers.gm1).toMatchObject({ value: 12, source: 'reviewer' });
    expect(reviewed.answers.customerName.source).toBe('sales');
    expect((await service.getProjectForExport(project.id)).status).toBe('reviewed');

    expect((await service.markManualSubmission(project.id)).status).toBe('pending_manual_submission');
    expect((await service.getProjectForExport(project.id)).status).toBe('pending_manual_submission');
    const submitted = await service.archive(project.id, { externalReference: 'OA-2026-001', note: '已人工提交' });
    expect(submitted).toMatchObject({
      status: 'pending_external_decision',
      externalSubmission: { externalReference: 'OA-2026-001', note: '已人工提交' },
    });
  });

  it('allows a populated blacklist rating to enter review without losing its risk', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await service.updateAnswers(project.id, completeValues({
      customerRating: '一级黑名单客户',
      chainLevel: 'first_subcontractor',
      isBackToBackPayment: true,
      isQualityWhitelistCustomer: false,
      prepaymentPercent: 0,
    }), 'sales');

    const prepared = await service.prepareReview(project.id);

    expect(prepared.status).toBe('pending_review');
    expect(prepared.risks.find((risk) => risk.ruleId === 'CUSTOMER_CREDIT')).toMatchObject({
      triggered: true,
      severity: 'blocking',
      missingKeys: [],
    });
  });

  it('allows sales-complete 2026 projects into backend review while system fields remain pending', async () => {
    const { project } = await service.startProject('preaudit202608', '张三');
    const updated = await service.updateAnswers(project.id, complete2026SalesValues(), 'sales');
    expect(updated.answers.customerRating).toBeUndefined();
    expect(updated.answers.divisionCommitment).toMatchObject({ source: 'agent', confirmationStatus: 'needs_confirmation' });

    await service.confirmReportSummary(project.id);
    await service.acknowledgeRisks(project.id);
    const prepared = await service.prepareReview(project.id);

    expect(prepared.status).toBe('pending_review');
    expect(prepared.conversationState).toMatchObject({ phase: 'submitted' });
    expect(prepared.risks.some((risk) => risk.missingKeys.includes('customerRating'))).toBe(true);
  });

  it('blocks 2026 submission until collection, profit and delivery commitments are trackable', async () => {
    const { project } = await service.startProject('preaudit202608', '李四');
    const values = complete2026SalesValues();
    values.collectionCommitment = '尽快回款';
    await service.updateAnswers(project.id, values, 'sales');
    await service.confirmReportSummary(project.id);
    await service.acknowledgeRisks(project.id);

    await expect(service.prepareReview(project.id)).rejects.toMatchObject({ code: 'INCOMPLETE_PROJECT' });
    expect((await service.getProject(project.id)).status).toBe('preaudit_needs_input');
  });

  it('requires an explicit, trackable new-opportunity commitment or an explicit no-opportunity statement', async () => {
    const { project } = await service.startProject('preaudit202608', '王五');
    const values = complete2026SalesValues();
    delete values.newOpportunityCommitment;
    await service.updateAnswers(project.id, values, 'sales');
    await service.confirmReportSummary(project.id);
    await service.acknowledgeRisks(project.id);

    await expect(service.prepareReview(project.id)).rejects.toMatchObject({ code: 'INCOMPLETE_PROJECT' });
    const explicitNone = await service.updateAnswers(project.id, {
      newOpportunityCommitment: '暂无新商机承诺',
    }, 'sales');
    expect(explicitNone.answers.divisionCommitment?.value).toContain('新商机承诺：暂无新商机承诺');
    expect((await service.prepareReview(project.id)).status).toBe('pending_review');
  });

  it('stops before risk review when a sales-owned risk answer is missing and proceeds after it is repaired', async () => {
    const { project } = await service.startProject('preaudit202608', '风险补答销售');
    const values = complete2026SalesValues();
    delete values.isEmptyTurnoverContract;
    await service.updateAnswers(project.id, values, 'sales');

    await expect(service.confirmReportSummary(project.id)).rejects.toMatchObject({
      code: 'INCOMPLETE_REPORT',
      message: expect.stringContaining('是否空转合同'),
    });
    expect((await service.getProject(project.id)).conversationState?.phase).toBe('project_report');

    await service.updateAnswers(project.id, { isEmptyTurnoverContract: false }, 'sales');
    expect((await service.confirmReportSummary(project.id)).conversationState?.phase).toBe('risk_review');
  });

  it('does not relabel unchanged sales answers as reviewer edits', async () => {
    const { project } = await service.startProject('preaudit202511', '赵六');
    const populated = await service.updateAnswers(project.id, completeValues({ customerName: '同一客户', endUserName: '同一客户' }), 'sales');
    await service.prepareReview(project.id);
    const unchangedDraft = Object.fromEntries(Object.entries(populated.answers).map(([key, answer]) => [key, answer.value]));
    const reviewed = await service.review(project.id, {
      reviewerName: '李复核', comments: '核对无修改', answerUpdates: unchangedDraft,
    });
    expect(reviewed.review?.fieldChanges).toBeUndefined();
    expect(reviewed.answers.customerName.source).toBe('sales');
    expect(Object.values(reviewed.answers).some((answer) => answer.source === 'reviewer')).toBe(false);
  });

  it('rejects illegal review and export operations', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await expect(
      service.review(project.id, { reviewerName: '李复核', comments: '不能跳过待复核状态' }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_STATUS_TRANSITION' });
    await expect(service.getProjectForExport(project.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_EXPORTABLE',
    });
  });

  it('keeps reviewed and externally submitted answers immutable', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await service.updateAnswers(project.id, completeValues(), 'sales');
    await service.prepareReview(project.id);
    await service.review(project.id, { reviewerName: '李复核', comments: '确认' });
    await expect(service.updateAnswers(project.id, { gm1: 15 }, 'reviewer')).rejects.toMatchObject({
      code: 'PROJECT_NOT_EDITABLE',
    });
    await service.markManualSubmission(project.id);
    await service.archive(project.id, {});
    await expect(service.updateAnswers(project.id, { gm1: 20 }, 'reviewer')).rejects.toMatchObject({
      code: 'PROJECT_NOT_EDITABLE',
    });
  });

  it('rejects reviewer changes that introduce conditional missing fields', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await service.updateAnswers(project.id, completeValues(), 'sales');
    await service.prepareReview(project.id);
    await expect(service.review(project.id, {
      reviewerName: '李复核',
      comments: '切换为采购项目',
      answerUpdates: { hasProcurement: true },
    })).rejects.toMatchObject({ code: 'INCOMPLETE_PROJECT' });
    expect((await service.getProject(project.id)).status).toBe('pending_review');
  });

  it('derives narrative summaries from structured narrative answers', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    const updated = await service.updateAnswers(project.id, {
      opportunitySource: '销售自拓',
      strategicAlignment: '符合战略',
      contractRiskControl: '法务审核',
      collectionCommitment: '月底回款',
    }, 'sales');
    expect(updated.narratives).toMatchObject({
      projectOverview: expect.stringContaining('销售自拓'),
      significance: expect.stringContaining('符合战略'),
      controls: expect.stringContaining('法务审核'),
      commitments: expect.stringContaining('月底回款'),
    });
  });

  it('serializes concurrent updates to the same project', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await Promise.all([
      service.updateAnswers(project.id, { contractName: '并发合同' }, 'sales'),
      service.updateAnswers(project.id, { customerName: '并发客户' }, 'sales'),
    ]);
    expect((await service.getProject(project.id)).answers).toMatchObject({
      contractName: { value: '并发合同' },
      customerName: { value: '并发客户' },
    });
  });

  it('appends interview messages to the persistent project', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    await service.appendMessage(project.id, {
      id: 'message-1',
      role: 'user',
      content: '合同名称是测试合同',
      createdAt: '2026-07-22T00:00:00.000Z',
    });
    expect((await service.getProject(project.id)).messages).toHaveLength(1);
  });

  it('deduplicates retried interview messages by their stable id', async () => {
    const { project } = await service.startProject('preaudit202511', '张三');
    const message = {
      id: 'stable-user-message',
      role: 'user' as const,
      content: '同一批回答',
      createdAt: '2026-07-23T00:00:00.000Z',
    };

    await Promise.all([
      service.appendMessage(project.id, message),
      service.appendMessage(project.id, message),
    ]);

    expect((await service.getProject(project.id)).messages).toHaveLength(1);
  });
});
