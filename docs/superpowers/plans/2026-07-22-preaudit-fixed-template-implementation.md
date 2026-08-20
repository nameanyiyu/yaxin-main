# Fixed-Template Preaudit Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current mock-heavy voice interview prototype into a persistent fixed-template workflow that evaluates auditable contract risks, supports human review, and exports the customer's original Excel form.

**Architecture:** Keep Next.js 16, React 19, Vercel AI SDK 7, and `ToolLoopAgent`. Add a pure TypeScript preaudit domain, a file-backed repository behind an interface, a versioned fixed-template manifest, an original-workbook Excel adapter, project-oriented API routes, and real admin/sales UI state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vercel AI SDK 7 `ToolLoopAgent`, Zod 4, SheetJS `xlsx`, Vitest, Node.js file system.

---

## File Structure

### New domain files

- `src/domain/preaudit/types.ts` — field, project, risk, review, and status types.
- `src/domain/preaudit/template-2025-11.ts` — fixed field definitions, questions, guidance, and Excel cell mappings.
- `src/domain/preaudit/risk-engine.ts` — eight deterministic risk rule groups.
- `src/domain/preaudit/interview.ts` — required-field checks and next-question selection.
- `src/domain/preaudit/state-machine.ts` — legal status transitions.
- `src/domain/preaudit/repository.ts` — repository contract and file-backed implementation.
- `src/domain/preaudit/service.ts` — application service coordinating repository, risks, and transitions.
- `src/domain/preaudit/excel-adapter.ts` — original-template validation and export.
- `src/domain/preaudit/agent.ts` — `ToolLoopAgent` configuration using the new domain tools.
- `src/domain/preaudit/bootstrap.ts` — idempotent registration of the fixed template.

### New API files

- `src/app/api/admin/projects/route.ts`
- `src/app/api/admin/projects/[id]/route.ts`
- `src/app/api/admin/projects/[id]/review/route.ts`
- `src/app/api/admin/projects/[id]/export/route.ts`
- `src/app/api/admin/projects/[id]/archive/route.ts`
- `src/app/api/s/[token]/prepare-review/route.ts`

### New UI files

- `src/components/admin/ProjectsPanel.tsx`
- `src/components/admin/ProjectReviewPanel.tsx`

### New tests

- `src/domain/preaudit/__tests__/template-2025-11.test.ts`
- `src/domain/preaudit/__tests__/risk-engine.test.ts`
- `src/domain/preaudit/__tests__/interview.test.ts`
- `src/domain/preaudit/__tests__/state-machine.test.ts`
- `src/domain/preaudit/__tests__/repository.test.ts`
- `src/domain/preaudit/__tests__/service.test.ts`
- `src/domain/preaudit/__tests__/excel-adapter.test.ts`

### Modified files

- `package.json` — add Vitest scripts and dependency.
- `.gitignore` — ignore runtime state and generated exports while retaining the fixed source template.
- `src/types/index.ts` — retain only `SystemSettings` and transcription/LLM setting types; project types come from the preaudit domain.
- `src/app/api/admin/templates/route.ts` — expose the fixed template and reject arbitrary uploads.
- `src/app/api/s/[token]/route.ts` — return the fixed template summary.
- `src/app/api/s/[token]/start/route.ts` — create/resume projects.
- `src/app/api/s/[token]/chat/route.ts` — use the new Agent and repository.
- `src/app/s/[token]/page.tsx` — align summary and completion states with review workflow.
- `src/components/sales/VoiceChatPanel.tsx` — render new tools and completion action.
- `src/components/sales/FieldSummary.tsx` — render sections and risks.
- `src/components/sales/CompletePage.tsx` — say “submitted for internal review.”
- `src/app/admin/page.tsx` — replace mock submissions panel with projects panel.
- `src/components/admin/TemplatesPanel.tsx` — show fixed template only.
- `src/components/admin/SettingsPanel.tsx` — remove missing connection-test action and label approval integration unavailable.
- `src/lib/feishu.ts` — remove mock success behavior from reachable paths.
- `README.md` — document the fixed-template workflow and internal deployment.

### Runtime files

- `data/templates/preaudit-2025-11.xlsx` — copy of the customer-provided template.
- `data/state/.gitkeep` — state directory placeholder; JSON state remains ignored.

---

## Task 1: Establish Test Harness and Safe Runtime Layout

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `vitest.config.ts`
- Create: `data/state/.gitkeep`
- Copy: `data/templates/preaudit-2025-11.xlsx`

- [ ] **Step 1: Add a failing smoke test before installing Vitest**

Create `src/domain/preaudit/__tests__/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('preaudit test harness', () => {
  it('loads the configured path alias', async () => {
    const module = await import('@/config');
    expect(module.APP_CONFIG.name).toContain('亚信科技');
  });
});
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/harness.test.ts`

Expected: FAIL because `vitest` is not installed.

- [ ] **Step 3: Add the test scripts and dependency**

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Create `vitest.config.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(projectDir, 'src') },
  },
});
```

Append to `.gitignore`:

```gitignore
/data/state/*.json
/data/state/*.tmp
/data/exports/
```

Copy the supplied workbook exactly to `data/templates/preaudit-2025-11.xlsx` and create an empty `data/state/.gitkeep`.

- [ ] **Step 4: Install and verify GREEN**

Run: `pnpm install`

If the local pnpm policy blocks ignored optional builds, run the installed Vitest binary directly after dependency resolution.

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/harness.test.ts`

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add asiainfo-preaudit-voice/package.json asiainfo-preaudit-voice/pnpm-lock.yaml \
  asiainfo-preaudit-voice/vitest.config.ts asiainfo-preaudit-voice/.gitignore \
  asiainfo-preaudit-voice/data/templates/preaudit-2025-11.xlsx \
  asiainfo-preaudit-voice/data/state/.gitkeep \
  asiainfo-preaudit-voice/src/domain/preaudit/__tests__/harness.test.ts
git commit -m "test: establish preaudit test harness"
```

## Task 2: Define the Fixed Template Domain

**Files:**
- Create: `src/domain/preaudit/types.ts`
- Create: `src/domain/preaudit/template-2025-11.ts`
- Test: `src/domain/preaudit/__tests__/template-2025-11.test.ts`

- [ ] **Step 1: Write failing template manifest tests**

```ts
import { describe, expect, it } from 'vitest';
import { PREAUDIT_TEMPLATE_2025_11 } from '../template-2025-11';

describe('PREAUDIT_TEMPLATE_2025_11', () => {
  it('uses a stable token and exact workbook anchors', () => {
    expect(PREAUDIT_TEMPLATE_2025_11.token).toBe('preaudit202511');
    expect(PREAUDIT_TEMPLATE_2025_11.sheetName).toBe('域外合同前置审批表-2025年11月启用');
    expect(PREAUDIT_TEMPLATE_2025_11.anchors).toEqual({ B2: '域外合同前置特批审批表', B49: '后台部门建议' });
  });

  it('maps every feedback row and does not duplicate field keys', () => {
    const keys = PREAUDIT_TEMPLATE_2025_11.fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PREAUDIT_TEMPLATE_2025_11.riskCells).toEqual({
      customerCredit: 'G8', contractChain: 'G9', paymentTerms: 'G10',
      projectMargin: 'G11', pureProcurement: 'G12', supplierCredit: 'G14',
      procurementPayment: 'G15', subcontracting: 'G16',
    });
    expect(PREAUDIT_TEMPLATE_2025_11.fields.some((field) => field.targetCells.includes('E48'))).toBe(true);
  });

  it('marks procurement questions conditional', () => {
    const supplier = PREAUDIT_TEMPLATE_2025_11.fields.find((field) => field.key === 'supplierName');
    expect(supplier?.requiredWhen).toEqual({ field: 'hasProcurement', equals: true });
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/template-2025-11.test.ts`

Expected: FAIL because the domain files do not exist.

- [ ] **Step 3: Implement types and the manifest**

In `types.ts`, define `FieldType`, `ConditionDefinition`, `TemplateFieldDefinition`, `FixedTemplateDefinition`, `ProjectStatus`, `FieldAnswer`, `InterviewMessage`, `RiskFinding`, `ProjectNarratives`, `ReviewDecision`, and `PreauditProject` exactly as approved in the design spec. Use ISO strings for persisted dates and `string | number | boolean` for answer values.

In `template-2025-11.ts`, export a complete `PREAUDIT_TEMPLATE_2025_11` with:

```ts
const procurementCondition: ConditionDefinition = { field: 'hasProcurement', equals: true };
const financingCondition: ConditionDefinition = { field: 'hasFinancing', equals: true };
const GUIDANCE = {
  D21: '明确商机渠道方、商务关系与客情关系；商机来源可为自拓、高层、展会或渠道。',
  D22: '说明项目立项背景、必要性和政策支持。',
  D23: '说明每一级客户评级、资金方、项目阶段、上下游签署状态、付款节奏及我司签约方。',
  D24: '说明资金方、财政拨款或自筹等资金来源、行政审批和资金落实情况。',
  D25: '说明项目提供内容、付款方式/节奏/账期，以及验收交付和服务期限。',
  D26: '说明合同额、净销售额、税率和项目全口径毛利率。',
  D27: '区分技术外包与外采软硬件，说明采购内容、原因和预算。',
  D28: '说明指定供应商情况、能力资质、大型企业属性及商务部确认情况。',
  D29: '说明采购金额、税率、方式，以及付款/交付/验收/售后/违约是否完全背靠背。',
  D30: '说明垫资金额、成本、原因，以及上下游付款时间、账期和付款方式。',
} as const;

function field(
  key: string,
  label: string,
  section: string,
  type: FieldType,
  required: boolean,
  question: string,
  targetCells: string[],
  requiredWhen?: ConditionDefinition,
  guidance?: string,
): TemplateFieldDefinition {
  return { key, label, section, type, required, question, targetCells, requiredWhen, guidance };
}

export const PREAUDIT_TEMPLATE_2025_11: FixedTemplateDefinition = {
  id: 'preaudit-2025-11',
  version: '2025-11',
  name: '域外合同前置审批表-2025年11月启用',
  token: 'preaudit202511',
  fileName: 'preaudit-2025-11.xlsx',
  sheetName: '域外合同前置审批表-2025年11月启用',
  anchors: { B2: '域外合同前置特批审批表', B49: '后台部门建议' },
  riskCells: {
    customerCredit: 'G8', contractChain: 'G9', paymentTerms: 'G10',
    projectMargin: 'G11', pureProcurement: 'G12', supplierCredit: 'G14',
    procurementPayment: 'G15', subcontracting: 'G16',
  },
  fields: [
    field('contractName', '合同名称', 'basic', 'text', true, '合同名称是什么？', ['B4']),
    field('contractAmountCny', '合同总额（CNY）', 'basic', 'amount', true, '合同总额是多少人民币？', ['B4']),
    field('gm1', '合同利润率（GM1）', 'basic', 'percentage', true, '项目 GM1 是多少？', ['B4']),
    field('customerName', '签约客户全称', 'basic', 'text', true, '签约客户全称是什么？', ['E4']),
    field('customerRating', '签约客户评级', 'basic', 'rating', true, '签约客户评级是什么？', ['E4']),
    field('endUserName', '最终用户全称', 'basic', 'text', true, '最终用户全称是什么？', ['E4']),
    field('supplierName', '供应商全称', 'basic', 'text', false, '供应商全称是什么？', ['E4'], procurementCondition),
    field('salesBu', '销售 BU', 'basic', 'text', true, '所属销售 BU 是什么？', ['G4']),
    field('salesRegion', '销售区域', 'basic', 'text', true, '销售区域是什么？', ['G4']),
    field('salesManager', '销售经理', 'basic', 'text', true, '销售经理是谁？', ['G4']),
    field('opportunitySource', '商机来源', 'project', 'text', true, '商机来自哪里？', ['E21'], undefined, GUIDANCE.D21),
    field('projectBackground', '项目背景及政策', 'project', 'text', true, '请说明项目背景和政策支持。', ['E22'], undefined, GUIDANCE.D22),
    field('contractChainProgress', '签约链条及签约进展', 'project', 'text', true, '请说明签约链条和当前签约进展。', ['E23'], undefined, GUIDANCE.D23),
    field('fundingStatus', '资金方及资金来源与落实情况', 'project', 'text', true, '请说明资金方、资金来源和落实情况。', ['E24'], undefined, GUIDANCE.D24),
    field('commercialTerms', '重要商务条款', 'project', 'text', true, '请说明提供内容、付款、验收和交付条款。', ['E25'], undefined, GUIDANCE.D25),
    field('amountMarginRecognition', '项目金额、利润及收入确认方法', 'project', 'text', true, '请说明金额、税率、毛利率和收入确认方法。', ['E26'], undefined, GUIDANCE.D26),
    field('procurementOverview', '采购类型、内容、原因及预算', 'procurement', 'text', false, '请说明采购类型、内容、原因和预算。', ['E27'], procurementCondition, GUIDANCE.D27),
    field('supplierOverview', '供应商情况说明', 'procurement', 'text', false, '请说明供应商资质和能力。', ['E28'], procurementCondition, GUIDANCE.D28),
    field('procurementTerms', '采购形式及重要商务条款', 'procurement', 'text', false, '请说明采购金额、方式和条款。', ['E29'], procurementCondition, GUIDANCE.D29),
    field('financingOverview', '垫资情况说明', 'procurement', 'text', false, '请说明垫资金额、成本、原因和上下游付款安排。', ['E30'], financingCondition, GUIDANCE.D30),
    field('strategicAlignment', '战略契合度', 'significance', 'text', true, '项目与公司战略如何契合？', ['E33']),
    field('productCapability', '公司产品能力', 'significance', 'text', true, '项目如何体现或拓展公司产品能力？', ['E34']),
    field('projectContinuity', '项目延续性', 'significance', 'text', true, '项目是否会带来延续性机会？', ['E35']),
    field('contractRiskControl', '签约风险管控', 'control', 'text', true, '针对签约风险有哪些管控措施？', ['E38']),
    field('deliveryRiskControl', '交付风险管控', 'control', 'text', true, '针对交付风险有哪些管控措施？', ['E39']),
    field('collectionRiskControl', '回款风险管控', 'control', 'text', true, '针对回款风险有哪些管控措施？', ['E40']),
    field('collectionCommitment', '回款承诺', 'commitment', 'text', false, '请给出回款时间承诺。', ['E43']),
    field('deliveryCommitment', '交付承诺', 'commitment', 'text', false, '请给出交付质量和时间承诺。', ['E44']),
    field('marginCommitment', '利润承诺', 'commitment', 'text', false, '请给出利润达标承诺。', ['E45']),
    field('supplierCommitment', '供应商承诺', 'commitment', 'text', false, '请给出供应商风控落实承诺。', ['E46'], procurementCondition),
    field('newOpportunityCommitment', '新商机承诺', 'commitment', 'text', false, '请说明衍生新项目承诺。', ['E47']),
    field('otherCommitment', '其他承诺', 'commitment', 'text', false, '是否还有其他承诺？', ['E48']),
  ],
};
```

Add structured rule inputs such as `hasProcurement`, `chainLevel`, `isBackToBackPayment`, `prepaymentPercent`, `hasChannelFee`, `externalProcurementPercent`, `thirdPartyCoreDelivery`, `supplierPaidInCapital`, `procurementAmount`, `supplierEntityType`, `supplierRating`, `advanceProcurement`, `directFinancingAmount`, `directFinancingMonths`, `potentialFinancingAmount`, and `allowsUnauthorizedSubcontracting`. They are interview fields even when they have no direct cell; their values feed risk summaries written to G8:G16.

- [ ] **Step 4: Verify GREEN**

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/template-2025-11.test.ts`

Expected: all manifest tests pass.

- [ ] **Step 5: Commit**

```bash
git add asiainfo-preaudit-voice/src/domain/preaudit/types.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/template-2025-11.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/__tests__/template-2025-11.test.ts
git commit -m "feat: define fixed preaudit template domain"
```

## Task 3: Implement the Deterministic Risk Engine

**Files:**
- Create: `src/domain/preaudit/risk-engine.ts`
- Test: `src/domain/preaudit/__tests__/risk-engine.test.ts`

- [ ] **Step 1: Write failing boundary tests**

Cover at minimum:

```ts
it.each([
  [{ customerRating: 'E' }, 'CUSTOMER_CREDIT', 'blocking'],
  [{ customerRating: 'D', prepaymentPercent: 99 }, 'CUSTOMER_CREDIT', 'high'],
  [{ gm1: 5 }, 'PROJECT_MARGIN', 'blocking'],
  [{ gm1: 15, hasChannelFee: true }, 'PROJECT_MARGIN', 'high'],
  [{ externalProcurementPercent: 85 }, 'PURE_PROCUREMENT', 'high'],
  [{ externalProcurementPercent: 50, thirdPartyCoreDelivery: true }, 'PURE_PROCUREMENT', 'high'],
  [{ hasProcurement: true, supplierEntityType: 'individual' }, 'SUPPLIER_CREDIT', 'blocking'],
  [{ hasProcurement: true, allowsUnauthorizedSubcontracting: true }, 'SUBCONTRACTING', 'blocking'],
])('evaluates boundary case %o', (answers, ruleId, severity) => {
  const finding = evaluateRisks(answers).find((item) => item.ruleId === ruleId);
  expect(finding).toMatchObject({ triggered: true, severity });
});

it('requires 40 percent prepayment for B-rated back-to-back customer', () => {
  const finding = evaluateRisks({ chainLevel: 'first_subcontractor', isBackToBackPayment: true, customerRating: 'B', prepaymentPercent: 20 })
    .find((item) => item.ruleId === 'PAYMENT_TERMS');
  expect(finding?.reason).toContain('40%');
});

it('skips procurement findings when procurement is false', () => {
  const findings = evaluateRisks({ hasProcurement: false });
  expect(findings.filter((item) => item.category === 'procurement')).toHaveLength(0);
});
```

- [ ] **Step 2: Verify RED**

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/risk-engine.test.ts`

Expected: FAIL because `evaluateRisks` does not exist.

- [ ] **Step 3: Implement eight pure rule evaluators**

Export `evaluateRisks(answers)` and one internal evaluator per approved rule group. Use numeric comparison only after a shared `numberValue` helper validates the answer. Return a finding with `triggered: false` only when enough evidence exists; otherwise return `missingKeys` and follow-up questions. Omit procurement findings when `hasProcurement === false`.

Use this prepayment table:

```ts
const REQUIRED_PREPAYMENT: Record<string, number> = { S: 10, A: 20, B: 40, C: 60, D: 100 };
```

Use exact boundary operators from the design: GM1 `<= 5`, channel GM1 `<= 15`, external procurement `>= 85`, direct financing exception requires both `< 500_000` and `< 3`, potential financing exception `<= 2_000_000`.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `./node_modules/.bin/vitest run src/domain/preaudit/__tests__/risk-engine.test.ts`

Run: `./node_modules/.bin/vitest run`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add asiainfo-preaudit-voice/src/domain/preaudit/risk-engine.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/__tests__/risk-engine.test.ts
git commit -m "feat: implement contract preaudit risk engine"
```

## Task 4: Add Interview Selection and State Machine

**Files:**
- Create: `src/domain/preaudit/interview.ts`
- Create: `src/domain/preaudit/state-machine.ts`
- Test: `src/domain/preaudit/__tests__/interview.test.ts`
- Test: `src/domain/preaudit/__tests__/state-machine.test.ts`

- [ ] **Step 1: Write failing interview tests**

```ts
it('asks required base fields before narrative fields', () => {
  const next = getNextQuestion(emptyProject());
  expect(next?.fieldKey).toBe('contractName');
});

it('skips procurement fields when procurement is false', () => {
  const project = projectWithAllRequired({ hasProcurement: false });
  expect(getMissingRequiredFields(project).some((field) => field.section === 'procurement')).toBe(false);
});

it('prioritizes risk evidence gaps over optional commitments', () => {
  const project = projectWithAllRequired({ customerRating: 'D' });
  expect(getNextQuestion(project)?.fieldKey).toBe('prepaymentPercent');
});
```

- [ ] **Step 2: Write failing transition tests**

```ts
expect(canTransition('interviewing', 'pending_review')).toBe(true);
expect(canTransition('interviewing', 'pending_manual_submission')).toBe(false);
expect(canTransition('pending_review', 'reviewed')).toBe(true);
expect(canTransition('reviewed', 'pending_manual_submission')).toBe(true);
expect(canTransition('pending_manual_submission', 'archived')).toBe(true);
```

- [ ] **Step 3: Verify RED**

Run both test files and confirm missing-module failures.

- [ ] **Step 4: Implement minimal pure functions**

`interview.ts` exports `isFieldRequired`, `getMissingRequiredFields`, `getNextQuestion`, and `isReadyForReview`. Priority order: basic structured inputs, unresolved risk missing keys, project narrative, significance, controls, commitments.

`state-machine.ts` exports:

```ts
const transitions: Record<ProjectStatus, ProjectStatus[]> = {
  interviewing: ['preaudit_needs_input', 'pending_review'],
  preaudit_needs_input: ['interviewing', 'pending_review'],
  pending_review: ['interviewing', 'reviewed'],
  reviewed: ['pending_manual_submission'],
  pending_manual_submission: ['archived'],
  archived: [],
};
```

`assertTransition` throws an error with code `ILLEGAL_STATUS_TRANSITION` when the edge is absent.

- [ ] **Step 5: Verify GREEN and commit**

Run the two tests and the full suite, then commit:

```bash
git add asiainfo-preaudit-voice/src/domain/preaudit/interview.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/state-machine.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/__tests__/interview.test.ts \
  asiainfo-preaudit-voice/src/domain/preaudit/__tests__/state-machine.test.ts
git commit -m "feat: add interview progression and status machine"
```

## Task 5: Implement File Persistence and Application Service

**Files:**
- Create: `src/domain/preaudit/repository.ts`
- Create: `src/domain/preaudit/service.ts`
- Create: `src/domain/preaudit/bootstrap.ts`
- Test: `src/domain/preaudit/__tests__/repository.test.ts`
- Test: `src/domain/preaudit/__tests__/service.test.ts`

- [ ] **Step 1: Write failing repository tests**

Use a unique `mkdtemp` directory for each test. Verify empty initialization, create/read/update, persistence after a new repository instance, and refusal to overwrite malformed JSON.

```ts
const repo = new FilePreauditRepository(tempDir);
await repo.initialize();
await repo.saveProject(sampleProject);
const reloaded = new FilePreauditRepository(tempDir);
await reloaded.initialize();
expect(await reloaded.getProject(sampleProject.id)).toEqual(sampleProject);
```

- [ ] **Step 2: Verify repository RED**

Run the repository test and confirm the missing class failure.

- [ ] **Step 3: Implement repository contract and file implementation**

Define:

```ts
export interface PreauditRepository {
  initialize(): Promise<void>;
  listProjects(filters?: { status?: ProjectStatus; token?: string }): Promise<PreauditProject[]>;
  getProject(id: string): Promise<PreauditProject | undefined>;
  findActiveProject(token: string, salesName: string): Promise<PreauditProject | undefined>;
  saveProject(project: PreauditProject): Promise<void>;
}
```

Write JSON using `projects.json.tmp` followed by `rename`. Serialize writes through a module-level promise queue. Validate loaded data with Zod before accepting it.

- [ ] **Step 4: Write failing service tests**

Verify create/resume, validated field updates, risk recomputation, ready-for-review rejection when required fields are missing, review confirmation, pending-manual-submission, and archive transitions.

- [ ] **Step 5: Implement service and bootstrap**

`PreauditService` methods:

```ts
startProject(token: string, salesName: string): Promise<{ project: PreauditProject; resumed: boolean }>;
updateAnswers(id: string, values: Record<string, unknown>, source: 'sales' | 'reviewer'): Promise<PreauditProject>;
appendMessage(id: string, message: InterviewMessage): Promise<void>;
prepareReview(id: string): Promise<PreauditProject>;
review(id: string, input: { reviewerName: string; comments: string; answerUpdates?: Record<string, unknown> }): Promise<PreauditProject>;
markManualSubmission(id: string): Promise<PreauditProject>;
archive(id: string, input: { externalReference?: string; note?: string }): Promise<PreauditProject>;
```

Create a singleton factory that resolves `PREAUDIT_DATA_DIR` or defaults to `<cwd>/data/state` and initializes the repository once.

- [ ] **Step 6: Verify GREEN and commit**

Run repository/service tests and full suite, then commit the five files.

## Task 6: Fill the Original Excel Template

**Files:**
- Create: `src/domain/preaudit/excel-adapter.ts`
- Test: `src/domain/preaudit/__tests__/excel-adapter.test.ts`

- [ ] **Step 1: Write failing original-workbook preservation tests**

Load `data/templates/preaudit-2025-11.xlsx`, export a project, then assert:

```ts
expect(sheet.B2.v).toBe('域外合同前置特批审批表');
expect(sheet.B4.v).toContain('合同名称：测试合同');
expect(sheet.G11.v).toContain('涉及');
expect(sheet.E21.v).toBe('展会商机，已建立客户关系');
expect(sheet.E43.v).toBe('2026-12-31 前完成全部回款');
expect(sheet.C49.v).toContain('同意进入人工审批');
expect(sheet['!merges'].map(encodeRange)).toContain('B2:H2');
expect(sheet.D21.c?.[0]?.t).toContain('商机来源');
```

- [ ] **Step 2: Verify RED**

Run the Excel adapter test and confirm the adapter is missing.

- [ ] **Step 3: Implement template validation and export**

Read with `{ type: 'buffer', cellStyles: true, cellComments: true }`, trim the actual sheet name for comparison, validate B2/B49 anchors, and write only merged-range top-left cells.

Compose B4, E4, and G4 as labeled multiline strings. Write risk summaries to G8:G16 using:

```text
涉及｜阻断/高/中
命中原因：...
管控建议：...
```

Write the project fields directly to E21:E30, E33:E35, E38:E40, and E43:E48. Preserve the B49 label and write reviewer comments to the top-left cell C49 of the merged C49:H49 input area. Return an `ArrayBuffer` without mutating the source file.

- [ ] **Step 4: Verify GREEN, inspect exported workbook, and commit**

Run the test, export a fixture to `/tmp/preaudit-export-check.xlsx`, inspect its cells/comments/merges with SheetJS, and commit adapter plus tests.

## Task 7: Migrate API Routes and Agent

**Files:**
- Create: `src/domain/preaudit/agent.ts`
- Modify: `src/app/api/s/[token]/route.ts`
- Modify: `src/app/api/s/[token]/start/route.ts`
- Modify: `src/app/api/s/[token]/chat/route.ts`
- Create: `src/app/api/s/[token]/prepare-review/route.ts`
- Create: `src/app/api/admin/projects/route.ts`
- Create: `src/app/api/admin/projects/[id]/route.ts`
- Create: `src/app/api/admin/projects/[id]/review/route.ts`
- Create: `src/app/api/admin/projects/[id]/export/route.ts`
- Create: `src/app/api/admin/projects/[id]/archive/route.ts`
- Modify: `src/app/api/admin/templates/route.ts`

- [ ] **Step 1: Write service-level route contract tests before route code**

Add tests to `service.test.ts` for each route-visible operation and error code: invalid token, missing project, invalid values, incomplete review, illegal transition, successful export eligibility, and archive metadata.

- [ ] **Step 2: Verify RED for the newly required service behavior**

Run the focused service tests and confirm expected assertion failures.

- [ ] **Step 3: Implement Agent tools and service behavior**

Create a `ToolLoopAgent` with tools `extractProjectFields`, `evaluateProjectRisks`, `getNextInterviewQuestion`, `askRiskFollowUp`, `draftProjectNarratives`, and `markReadyForReview`. Tool schemas use Zod and permitted field keys from the manifest. On each executed extraction, call `service.updateAnswers`; `getNextInterviewQuestion` reloads the project through the service.

- [ ] **Step 4: Implement project API routes**

All routes return JSON errors shaped as:

```ts
{ error: { code: string; message: string } }
```

Map missing resources to 404, validation errors to 400, and illegal transitions to 409. The export route returns the original workbook MIME type and marks manual submission only after a successful export.

The templates POST route returns 405 with `FIXED_TEMPLATE_ONLY`; GET returns only the registered fixed template and `/s/preaudit202511` share path.

- [ ] **Step 5: Run full tests and production build**

Run: `./node_modules/.bin/vitest run`

Run: `./node_modules/.bin/next build`

Expected: tests and build pass.

- [ ] **Step 6: Commit**

Stage only the new domain Agent and migrated route files, then commit `feat: expose persistent preaudit workflow APIs`.

## Task 8: Replace Mock Admin UI with Real Review UI

**Files:**
- Create: `src/components/admin/ProjectsPanel.tsx`
- Create: `src/components/admin/ProjectReviewPanel.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/admin/TemplatesPanel.tsx`
- Modify: `src/components/admin/SettingsPanel.tsx`
- Remove: `src/components/admin/SubmissionsPanel.tsx`

- [ ] **Step 1: Add failing UI data-shape tests at the domain boundary**

Add a pure `src/domain/preaudit/presentation.ts` with a test requiring status labels, triggered-risk count, progress, and grouped answer sections. The test fails before implementation and avoids brittle component snapshots.

- [ ] **Step 2: Implement presentation mapping and verify GREEN**

Return Chinese labels for every project status and stable section order. Progress is completed required fields divided by applicable required fields.

- [ ] **Step 3: Implement real admin components**

`ProjectsPanel` fetches `/api/admin/projects`, supports status filtering, and opens `ProjectReviewPanel`. It must not contain hard-coded project/customer records.

`ProjectReviewPanel` shows structured answers, risk findings with evidence, narratives, reviewer name/comments, and buttons for save/recalculate, confirm review, export original Excel, and archive. Buttons are enabled only for legal states.

`TemplatesPanel` renders the fixed template card from GET `/api/admin/templates`, copies the stable share URL, and removes arbitrary upload/delete controls.

`SettingsPanel` removes the call to nonexistent `/api/admin/settings/test` and labels OA/Feishu “暂未接入，当前使用人工提交”.

- [ ] **Step 4: Run ESLint on changed files and fix all reported errors**

Run the direct ESLint binary over the changed files. Do not suppress `no-explicit-any` or hook rules; define API response types and derive values instead of setting state in effects where possible.

- [ ] **Step 5: Commit**

Commit `feat: add real project review administration`.

## Task 9: Complete the Sales Review Flow

**Files:**
- Modify: `src/app/s/[token]/page.tsx`
- Modify: `src/components/sales/VoiceChatPanel.tsx`
- Modify: `src/components/sales/FieldSummary.tsx`
- Modify: `src/components/sales/CompletePage.tsx`
- Modify: `src/components/hooks/useSpeechRecognition.ts`

- [ ] **Step 1: Write failing presentation tests for sales summary**

Extend `presentation.test.ts` to require grouped fields, missing required fields, triggered risks, and the completion copy `已提交后台复核`.

- [ ] **Step 2: Verify RED and implement summary mapping**

Run the focused test, implement the mapping, and verify GREEN.

- [ ] **Step 3: Migrate sales page state and transport**

Start/resume returns a `project`. Chat transport sends `projectId`. The completion action calls `/prepare-review` exactly once, renders the returned project summary, and confirms submission by moving to the completion page without calling the endpoint a second time.

Render tool invocations using discriminated unions instead of `any`. The completion message must say the project is waiting for internal review, not that external approval was submitted.

- [ ] **Step 4: Fix speech hook types**

Declare the minimal Web Speech interfaces locally, derive `isSupported` from the presence of the browser constructor, and remove synchronous state initialization inside effects.

- [ ] **Step 5: Verify components**

Run full Vitest, ESLint, and `next build`. Manually verify invalid token, start, chat input, summary, and completion pages with the local server.

- [ ] **Step 6: Commit**

Commit `feat: complete sales interview review handoff`.

## Task 10: Remove Legacy Mocks, Document Deployment, and Verify End to End

**Files:**
- Modify: `README.md`
- Modify: `src/lib/store.ts` — retain settings storage only and remove template/submission state.
- Modify: `src/lib/feishu.ts`
- Remove: `src/app/api/admin/submissions/route.ts`
- Remove: `src/app/api/admin/submissions/[id]/route.ts`
- Remove: `src/app/api/admin/export/[templateId]/route.ts`
- Remove: `src/app/api/admin/templates/[id]/route.ts`
- Remove: `src/app/api/s/[token]/complete/route.ts`
- Modify: `src/types/index.ts`
- Test: `src/domain/preaudit/__tests__/approval-adapter.test.ts`
- Modify: remaining files reported by ESLint

- [ ] **Step 1: Add a failing regression test for approval behavior**

```ts
it('does not fabricate approval success without an adapter', async () => {
  const result = await submitToApproval(undefined, sampleProject);
  expect(result).toEqual({ success: false, code: 'APPROVAL_NOT_CONFIGURED', message: '审批接口暂未接入，请人工提交。' });
});
```

- [ ] **Step 2: Verify RED and remove mock success**

Replace the reachable mock Feishu function with an approval adapter returning the explicit unavailable result. No response may contain a fabricated `feishu-${Date.now()}` ID.

- [ ] **Step 3: Remove dead mock and legacy code**

Delete the five listed legacy routes. Remove template/submission maps and functions from `src/lib/store.ts`, retaining only `getSettings` and `updateSettings`. Remove the legacy `Template`, `Submission`, `SubmissionMessage`, `ValidationResult`, and `FeishuSubmitResult` definitions from `src/types/index.ts`; retain `SystemSettings`. Confirm `rg "MOCK_TEMPLATES|MOCK_DATA|createSubmission|getAllSubmissions|feishu-" src` returns no matches.

- [ ] **Step 4: Rewrite README**

Document:

- supported fixed template and stable share URL;
- local internal-server installation and startup;
- `PREAUDIT_DATA_DIR` and backup requirements;
- LLM and transcription configuration;
- the eight risk groups;
- review/export/manual-submission workflow;
- explicit non-support for real OA/Feishu until an adapter is configured.

- [ ] **Step 5: Run fresh full verification**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/eslint .
./node_modules/.bin/next build
```

Start the server and verify:

```bash
curl -f http://localhost:3000/api/admin/templates
curl -f http://localhost:3000/api/admin/projects
curl -f http://localhost:3000/api/s/preaudit202511
```

Use the browser to complete a representative project with GM1 5%, confirm the risk appears, submit it for review, review it in the admin UI, export the workbook, inspect G11 and the preserved comments/merges, restart the server, and confirm the project still exists.

- [ ] **Step 6: Commit**

Stage all intended remaining files, inspect the diff for `.env.local` or runtime JSON, and commit `docs: finalize fixed-template preaudit workflow`.

---

## Plan Self-Review

- Spec coverage: Tasks 2–10 cover the fixed template, eight risk groups, Agent flow, persistence, human review, original-workbook export, manual submission, UI migration, error handling, and deployment documentation.
- Explicitly deferred: real OA/Feishu calls, approval callback, long-term post-approval tracking, general template design, and enterprise authentication remain outside the approved first release.
- Type consistency: all routes and components use `PreauditProject`, `ProjectStatus`, `RiskFinding`, and the stable token `preaudit202511` from the domain module.
- No runtime business data or `.env.local` is staged or committed.
