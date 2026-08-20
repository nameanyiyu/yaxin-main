import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultOrganizationConfig, type OrganizationNode } from '../organization-config';
import { findAnswerConsistencyIssues } from '../answer-consistency';
import { getCommitmentGaps, getMissingSalesReviewFields, isSalesReadyForReview, unresolvedSalesRiskKeys } from '../reporting-flow';
import { defaultRiskConfiguration, setRuntimeRiskConfiguration } from '../risk-config';
import { FilePreauditRepository } from '../repository';
import { answerProjectQuestion } from '../project-qa';
import { PreauditService } from '../service';

type Simulation = {
  name: string;
  bu: string;
  region: string;
  bg: 'TSG' | 'DIG' | 'SCG';
  utterance: string;
  values: Record<string, unknown>;
  expectedRiskIds: string[];
};

const commonValues = {
  contractName: '华东政企云资源池扩容项目',
  customerName: '华东移动信息技术有限公司',
  endUserName: '华东移动信息技术有限公司',
  contractAmountCny: 4_800_000,
  gm1: 12,
  salesManager: '模拟销售经理',
  isEmptyTurnoverContract: false,
  isFinancingTradeContract: false,
  hasNonMainBusiness: false,
  hasProcurement: false,
  hasDirectFinancing: false,
  chainLevel: 'direct',
  nonOperatorCount: 0,
  upstreamSigned: false,
  fundingPartyConfirmed: true,
  isBackToBackPayment: false,
  prepaymentPercent: 0,
  hasPotentialFinancing: false,
  opportunitySource: '客户续建商机与正式采购立项',
  projectBackground: '建设政企云资源池扩容，包含软件、实施和运维服务，满足客户年度信息化建设需求。',
  contractChainProgress: '最终用户、签约客户及我司签约方已梳理，我司直签；客户技术交流完成，预计9月签约。',
  fundingStatus: '资金来源为客户年度信息化预算，预算已经落实，付款按合同节点执行。',
  commercialTerms: '无预付款，终验后100%付款，非背靠背付款；计划11月完成交付、12月15日前完成验收。',
  amountMarginRecognition: '合同金额以项目报价和财务测算为准，GM1按当前测算确认，按终验一次性确认收入。',
  strategicAlignment: '复制云平台能力，符合公司重点行业数字化战略。',
  productCapability: '体现云平台建设、实施和运维产品能力。',
  projectContinuity: '预计形成三年运维续约和后续扩容机会。',
  contractRiskControl: '由销售经理跟进合同条件，签约前完成法务和商务复核。',
  deliveryRiskControl: '由交付经理锁定资源，按周检查交付里程碑并在偏差时升级。',
  collectionRiskControl: '由销售经理建立回款台账，按付款节点提前催收并保留验收证据。',
  otherRiskControl: '项目周例会跟踪重大偏差，必要时提交事业部升级处理。',
} satisfies Record<string, unknown>;

function withCommitments(values: Record<string, unknown>, includeSupplier = false) {
  return {
    ...values,
    collectionCommitment: '首笔回款目标为2026年10月30日前，全部回款目标为2026年12月15日前；按开票和终验条件执行，由销售经理负责，每周跟踪回款台账并在偏差时升级。',
    marginCommitment: `承诺守住GM1 ${String(values.gm1)}%；签约前锁定成本预算，由事业部财务负责人负责，每周复核成本台账，异常立即升级。`,
    deliveryCommitment: '承诺2026年11月30日前完成交付、2026年12月15日前完成终验，按合同验收标准并以测试通过为准；由交付经理负责，锁定资源并按周检查里程碑。',
    newOpportunityCommitment: values.hasProcurement === true
      ? '暂无新商机承诺'
      : '承诺2027年6月前形成后续扩容新商机，由销售经理负责，每月拜访客户并维护商机跟进台账。',
    ...(includeSupplier
      ? { supplierCommitment: '供应商承诺2026年10月20日前完成交付，付款按验收节点执行并禁止违规二次分包；由采购经理负责，锁定交付资源和付款审批。' }
      : {}),
  };
}

const simulations: Simulation[] = [
  {
    name: 'TSG 主业低风险项目', bu: 'CMC', region: '华东区', bg: 'TSG',
    utterance: '客户说是华东移动，项目是云资源池扩容，四百八十万，利润十二个点；没有预付款，终验后一次性付清，不背靠背，直签，九月签约，十一月底交付。',
    values: { ...commonValues }, expectedRiskIds: [],
  },
  {
    name: 'DIG 小额垫资与低利润项目', bu: 'SIO', region: '华东区', bg: 'DIG',
    utterance: '这是能源行业数据平台项目，客户不是白名单，合同三百八十万，GM1只有4%，外采一百五十万，另外需要垫资一百万元两个月，付款背靠背，预计十月签约。',
    values: {
      ...commonValues,
      customerName: '华东能源数字化有限公司', endUserName: '华东能源集团', gm1: 4,
      commercialTerms: '无预付款，背靠背付款，预计10月签约；交付和验收节点按项目合同约定执行。',
      hasProcurement: true, isPureProcurement: true, externalProcurementAmount: 1_500_000,
      externalProcurementPercent: 50, isAisBusiness: false, aisFinancingDecision: '不适用，非AIS业务',
      isScgAllInOneMachine: false, hasDirectFinancing: true, directFinancingAmount: 1_000_000,
      directFinancingMonths: 2, isBackToBackPayment: true, isQualityWhitelistCustomer: false,
      supplierName: '华东云集成供应商有限公司', procurementOverview: '外采云资源和实施服务，采用净额法判断，预算150万元。',
      supplierOverview: '供应商具备云平台交付能力，合同与交付范围已明确。',
      procurementTerms: '按验收节点付款，禁止违规二次分包，外采比例约50%。',
      financingOverview: '直接垫资100万元，期限2个月，待客户回款后收回。',
    },
    expectedRiskIds: ['DIG_SMALL_DIRECT_FINANCING', 'DIG_SMALL_PURE_PROCUREMENT', 'DIG_BACK_TO_BACK', 'DIG_LOW_MARGIN'],
  },
  {
    name: 'SCG 大额纯外采项目', bu: 'ESU', region: '华东区', bg: 'SCG',
    utterance: '客户是某制造集团，项目总额一千二百万，主要是外采代理，分包金额三百五十万，GM1 8%，无垫资，最终验收后付款，客户不是白名单。',
    values: {
      ...commonValues,
      customerName: '华东制造集团有限公司', endUserName: '华东制造集团有限公司', contractAmountCny: 12_000_000,
      gm1: 8, hasProcurement: true, isPureProcurement: true, externalProcurementAmount: 3_500_000,
      externalProcurementPercent: 80, isAisBusiness: false, aisFinancingDecision: '不适用，非AIS业务',
      isScgAllInOneMachine: false, isQualityWhitelistCustomer: false,
      supplierName: '华东工业软件供应商有限公司', procurementOverview: '纯外采工业软件代理，分包预算350万元，采用净额法判断。',
      supplierOverview: '供应商交付和售后能力已完成评估，待采购部核验评级。',
      procurementTerms: '按交付和验收节点付款，禁止违规二次分包，采购经理负责复核。',
    },
    expectedRiskIds: ['SCG_PURE_PROCUREMENT_OVER_300'],
  },
];

function shuffledSimulations(seed: number): Simulation[] {
  return simulations.toSorted((left, right) => {
    const leftScore = [...left.name].reduce((sum, char) => sum + char.charCodeAt(0), seed);
    const rightScore = [...right.name].reduce((sum, char) => sum + char.charCodeAt(0), seed);
    return (leftScore % 7) - (rightScore % 7);
  });
}

async function createSimulationService(dataDirectory: string) {
  const repository = new FilePreauditRepository(dataDirectory);
  await repository.initialize();
  const organization = defaultOrganizationConfig();
  const now = new Date().toISOString();
  const regionNodes: OrganizationNode[] = [
    ['region-cmc-east', '华东区', 'bu-tsg-cmc'],
    ['region-sio-east', '华东区', 'bu-dig-sio'],
    ['region-esu-east', '华东区', 'bu-sig-esu'],
  ].map(([id, name, parentId], sortOrder) => ({
    id, type: 'region', name, parentId, enabled: true, sortOrder, createdAt: now, updatedAt: now,
  }));
  const nodes = [...organization, ...regionNodes];
  return new PreauditService(repository, { organizationProvider: async () => nodes });
}

describe('sales project natural-language simulation', () => {
  it('runs randomized TSG, DIG and SCG reports through submission and keeps backend fields separate', async () => {
    setRuntimeRiskConfiguration(defaultRiskConfiguration());
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'preaudit-sales-simulation-'));
    try {
      const service = await createSimulationService(dataDirectory);
      for (const [index, scenario] of shuffledSimulations(202608).entries()) {
        const started = await service.startProject(
          'preaudit202608',
          `模拟销售-${scenario.bg}-${index}`,
          { token: 'preaudit202608', version: '2026-08' },
          { salesBu: scenario.bu, salesRegion: scenario.region, opportunitySerialNumber: `SIM-${scenario.bg}-${index}` },
        );
        let project = await service.updateAnswers(started.project.id, scenario.values, 'agent', {
          confidenceByKey: Object.fromEntries(Object.keys(scenario.values).map((key) => [key, 0.91])),
          confirmationStatus: 'needs_confirmation',
        });

        expect(project.messages).toHaveLength(0);
        expect(project.answers.customerRating).toBeUndefined();
        expect(project.answers.customerCollectionHealth).toBeUndefined();
        expect(project.answers.supplierRating).toBeUndefined();
        expect(project.answers.customerName?.source).toBe('agent');
        expect(project.answers.contractAmountCny?.confidence).toBe(0.91);
        expect(project.risks.every((risk) => risk.ruleId.startsWith('COMPANY_') || risk.ruleId.startsWith(`${scenario.bg}_`))).toBe(true);
        expect(scenario.expectedRiskIds.every((riskId) => project.risks.some((risk) => risk.ruleId === riskId && risk.triggered))).toBe(true);

        project = await service.confirmReportSummary(project.id);
        expect(project.conversationState?.phase).toBe('risk_review');
        project = await service.acknowledgeRisks(project.id);
        expect(project.conversationState?.phase).toBe('commitments');

        project = await service.updateAnswers(project.id, withCommitments(scenario.values, scenario.values.hasProcurement === true), 'sales', {
          confirmationStatus: 'confirmed',
        });
        expect(getCommitmentGaps(project)).toEqual([]);
        expect({
          ready: isSalesReadyForReview(project),
          missing: getMissingSalesReviewFields(project).map((field) => field.key),
          consistency: findAnswerConsistencyIssues(project),
          unresolvedRiskKeys: unresolvedSalesRiskKeys(project),
        }).toEqual({ ready: true, missing: [], consistency: [], unresolvedRiskKeys: [] });
        project = await service.prepareReview(project.id);
        expect(project.status).toBe('pending_review');
        expect(project.conversationState?.phase).toBe('submitted');
        expect(project.answers.customerRating).toBeUndefined();
        expect(project.answers.customerCollectionHealth).toBeUndefined();

        const beforeQa = structuredClone(project);
        const qaQuestions = [
          '项目名称是什么？',
          '客户、合同金额和预付款是多少？',
          '当前项目有哪些风险？',
          '当前项目适用哪些风险规则？',
          '项目的回款、利润、交付和新商机承诺是什么？',
          '这个项目是否自动准入？',
        ];
        const qaAnswers = [] as string[];
        for (const question of qaQuestions) qaAnswers.push(await answerProjectQuestion(project, question));
        expect(qaAnswers.every((answer) => answer.trim().length > 0)).toBe(true);
        expect(qaAnswers.join('\n')).toContain(String(project.answers.contractName?.value));
        expect(qaAnswers.join('\n')).toContain(String(project.answers.customerName?.value));
        expect(qaAnswers.join('\n')).toContain('不代表自动准入');
        expect(project).toEqual(beforeQa);
      }
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});
