# Five-Round Sales Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-field sales questioning with deterministic batches that expose every applicable question within at most five assistant question rounds.

**Architecture:** Add a pure interview-batch planner beside the existing field/risk completeness logic. The planner derives the next round from persisted user messages, groups related fields into concise numbered questions, and returns all remaining applicable questions in round five. The start route and existing ToolLoopAgent both consume the same planner and formatter, while DeepSeek remains responsible for extracting all fields from each batch answer.

**Tech Stack:** TypeScript, Next.js App Router, Vercel AI SDK `ToolLoopAgent`, Zod, Vitest.

---

## File Structure

- Create `src/domain/preaudit/interview-batches.ts`: question group definitions, five-round planning, round exhaustion and display formatting.
- Create `src/domain/preaudit/__tests__/interview-batches.test.ts`: pure tests for initial batching, procurement branching, fifth-round completeness, early completion and the hard cap.
- Modify `src/app/api/s/[token]/start/route.ts`: generate the first batch from the shared planner instead of asking only for contract name.
- Modify `src/domain/preaudit/agent.ts`: replace the single-question tool and instructions with the batch planner.
- Modify `README.md`: document the five-round sales flow.

### Task 1: Build the deterministic batch planner

**Files:**
- Create: `src/domain/preaudit/interview-batches.ts`
- Create: `src/domain/preaudit/__tests__/interview-batches.test.ts`

- [ ] **Step 1: Write the failing initial-batch and hard-cap tests**

Create project builders that return valid `PreauditProject` objects and add these assertions:

```ts
import { describe, expect, it } from 'vitest';
import { getInterviewBatch, MAX_INTERVIEW_ROUNDS } from '../interview-batches';
import type { PreauditProject } from '../types';

function project(input: Partial<PreauditProject> = {}): PreauditProject {
  return {
    id: 'project-1',
    templateVersion: '2025-11',
    token: 'preaudit202511',
    salesName: '张三',
    status: 'interviewing',
    answers: {},
    messages: [],
    risks: [],
    narratives: {},
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    ...input,
  };
}

describe('five-round interview batches', () => {
  it('starts with six concise basic-information questions', () => {
    const batch = getInterviewBatch(project());
    expect(batch.round).toBe(1);
    expect(batch.questions).toHaveLength(6);
    expect(batch.questions.flatMap((question) => question.fieldKeys)).toEqual(
      expect.arrayContaining(['contractName', 'contractAmountCny', 'gm1', 'customerName', 'salesManager']),
    );
  });

  it('never creates a sixth question batch', () => {
    const messages = Array.from({ length: MAX_INTERVIEW_ROUNDS }, (_, index) => ({
      id: `user-${index}`,
      role: 'user' as const,
      content: '未完整回答',
      createdAt: '2026-07-23T00:00:00.000Z',
    }));
    const batch = getInterviewBatch(project({ messages }));
    expect(batch.exhausted).toBe(true);
    expect(batch.questions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the planner test and verify RED**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: FAIL because `../interview-batches` does not exist.

- [ ] **Step 3: Implement planner types, round groups and hard cap**

Implement these public types and constants:

```ts
export const MAX_INTERVIEW_ROUNDS = 5;

export interface InterviewBatchQuestion {
  id: string;
  fieldKeys: string[];
  question: string;
}

export interface InterviewBatch {
  round: number;
  maxRounds: number;
  questions: InterviewBatchQuestion[];
  finalRound: boolean;
  readyForReview: boolean;
  exhausted: boolean;
  missingFieldKeys: string[];
}
```

Define six round-one groups, six risk-gate groups, six project-description groups, and round-four composite procurement/control/commitment groups. Each group contains a stable ID, short Chinese question, field keys, phase number and optional `procurement` condition.

Implement `getInterviewBatch(project)` with this exact policy:

```ts
const completedRounds = project.messages.filter((message) => message.role === 'user').length;
if (isReadyForReview(project)) return readyBatch(completedRounds);
if (completedRounds >= MAX_INTERVIEW_ROUNDS) return exhaustedBatch(project);

const round = completedRounds + 1;
const questions = round === MAX_INTERVIEW_ROUNDS
  ? allRemainingApplicableGroups(project)
  : currentPhaseGroupsFirst(project, round).slice(0, 10);
return {
  round,
  maxRounds: MAX_INTERVIEW_ROUNDS,
  questions,
  finalRound: round === MAX_INTERVIEW_ROUNDS,
  readyForReview: false,
  exhausted: false,
  missingFieldKeys: uniqueMissingKeys(questions),
};
```

Group selection must remove already answered keys, ignore procurement-only keys when `hasProcurement` is false, retain the combined procurement/financing gate in round two, and deduplicate fields.

- [ ] **Step 4: Run the planner test and verify GREEN**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add branch and completeness tests**

Add tests proving:

```ts
it('asks procurement composites only when procurement applies', () => {
  const withoutProcurement = getInterviewBatch(projectWithRounds(3, { hasProcurement: false }));
  expect(withoutProcurement.questions.flatMap((question) => question.fieldKeys)).not.toContain('supplierName');

  const withProcurement = getInterviewBatch(projectWithRounds(3, { hasProcurement: true }));
  expect(withProcurement.questions.flatMap((question) => question.fieldKeys)).toContain('supplierName');
});

it('puts every remaining applicable key in round five', () => {
  const batch = getInterviewBatch(projectWithRounds(4, { hasProcurement: true, hasFinancing: true }));
  expect(batch.finalRound).toBe(true);
  expect(batch.questions.flatMap((question) => question.fieldKeys)).toEqual(
    expect.arrayContaining(['contractName', 'supplierName', 'directFinancingAmount', 'collectionCommitment']),
  );
});

it('ends early when required fields and risk evidence are complete', () => {
  const batch = getInterviewBatch(completeProject());
  expect(batch.readyForReview).toBe(true);
  expect(batch.questions).toEqual([]);
});
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts src/domain/preaudit/__tests__/interview.test.ts
git add src/domain/preaudit/interview-batches.ts src/domain/preaudit/__tests__/interview-batches.test.ts
git commit -m "feat: plan sales interview in five batches"
```

Expected: both test files pass and the commit succeeds.

### Task 2: Share concise formatting with the start route

**Files:**
- Modify: `src/domain/preaudit/interview-batches.ts`
- Modify: `src/domain/preaudit/__tests__/interview-batches.test.ts`
- Modify: `src/app/api/s/[token]/start/route.ts`

- [ ] **Step 1: Write a failing formatter test**

```ts
it('formats a numbered batch with the round indicator', () => {
  const text = formatInterviewBatch(getInterviewBatch(project()), '张三');
  expect(text).toContain('第 1/5 轮');
  expect(text).toContain('1.');
  expect(text).toContain('6.');
  expect(text).not.toContain('逐项');
});
```

- [ ] **Step 2: Run the formatter test and verify RED**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: FAIL because `formatInterviewBatch` is not exported.

- [ ] **Step 3: Implement the shared formatter**

```ts
export function formatInterviewBatch(batch: InterviewBatch, salesName?: string): string {
  if (batch.readyForReview) return '信息已收集完整，可以在页面确认并提交后台复核。';
  if (batch.exhausted) return `五轮访谈已结束。仍缺：${batch.missingFieldKeys.join('、')}。请检查后再提交复核。`;
  const greeting = salesName ? `您好 ${salesName}！` : '';
  const heading = `${greeting}第 ${batch.round}/${batch.maxRounds} 轮，请按编号一起回答：`;
  return [heading, ...batch.questions.map((item, index) => `${index + 1}. ${item.question}`)].join('\n');
}
```

The exhausted text is a status statement and must not contain a new interrogative sentence.

- [ ] **Step 4: Replace the start-route single question**

Import `getInterviewBatch` and `formatInterviewBatch`, then create the first message with:

```ts
const firstBatch = getInterviewBatch(result.project);
await service.appendMessage(result.project.id, {
  id: randomUUID(),
  role: 'assistant',
  content: formatInterviewBatch(firstBatch, result.project.salesName),
  createdAt: new Date().toISOString(),
});
```

Remove the single `fieldKey: 'contractName'` marker because one assistant message now covers multiple fields.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
git add src/domain/preaudit/interview-batches.ts src/domain/preaudit/__tests__/interview-batches.test.ts 'src/app/api/s/[token]/start/route.ts'
git commit -m "feat: start sales interviews with a question batch"
```

Expected: tests pass and the commit succeeds.

### Task 3: Make the Agent consume batches

**Files:**
- Modify: `src/domain/preaudit/agent.ts`
- Modify: `src/domain/preaudit/__tests__/interview-batches.test.ts`

- [ ] **Step 1: Add a failing Agent-facing payload test**

Add and export `toInterviewBatchPayload(project)` from the planner, then test the desired contract:

```ts
it('returns an agent payload with no questions after five answers', () => {
  const payload = toInterviewBatchPayload(projectWithRounds(5));
  expect(payload).toMatchObject({
    exhausted: true,
    questions: [],
    maxRounds: 5,
  });
});
```

- [ ] **Step 2: Run the payload test and verify RED**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: FAIL because `toInterviewBatchPayload` does not exist.

- [ ] **Step 3: Implement the payload adapter**

```ts
export function toInterviewBatchPayload(project: PreauditProject) {
  const batch = getInterviewBatch(project);
  return {
    readyForReview: batch.readyForReview,
    exhausted: batch.exhausted,
    round: batch.round,
    maxRounds: batch.maxRounds,
    finalRound: batch.finalRound,
    questions: batch.questions,
    missingFieldKeys: batch.missingFieldKeys,
  };
}
```

- [ ] **Step 4: Replace single-question Agent instructions and tool**

In `src/domain/preaudit/agent.ts`:

- replace `getNextQuestion` with `toInterviewBatchPayload`;
- rename `getNextInterviewQuestion` to `getNextInterviewBatch`;
- remove `askRiskFollowUp`;
- change instructions from “每次只问一个问题” to:

```text
每轮先提取销售回答中所有高置信度字段，然后调用 getNextInterviewBatch。
只能输出该工具返回的问题批次，必须一次输出整批编号问题，不能拆成逐项追问。
工具返回 readyForReview 时提示销售确认送审；返回 exhausted 时只说明五轮结束和缺项，不得提出第六批问题。
问题文字保持简洁，不重复模板说明；风险结论仍只能来自 evaluateProjectRisks。
```

The tool description must be:

```ts
description: '根据持久化项目和已完成销售回答次数，返回下一批问题；最多五批。',
```

and its executor must reload the project immediately before returning `toInterviewBatchPayload(latest)`.

- [ ] **Step 5: Verify Agent compilation and behavior tests**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
npm run lint
npm run build
```

Expected: tests, ESLint and Next.js production build pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/preaudit/agent.ts src/domain/preaudit/interview-batches.ts src/domain/preaudit/__tests__/interview-batches.test.ts
git commit -m "feat: enforce batched questions in the sales agent"
```

### Task 4: Documentation, end-to-end regression and publication

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-23-five-round-sales-interview-implementation.md`

- [ ] **Step 1: Update README sales workflow**

Document:

```text
销售访谈最多五轮。每轮展示 6～10 个编号问题并支持一次文字或语音批量回答；
第 5 轮一次列出全部剩余适用问题，之后不生成第 6 轮。
采购与垫资条件在前两轮确认，后续批次自动展开对应问题。
```

- [ ] **Step 2: Run the complete verification suite**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every test passes, ESLint exits zero, production build succeeds and `git diff --check` has no output.

- [ ] **Step 3: Run HTTP smoke verification**

Start the stable development server:

```bash
npm run dev
```

Verify:

```bash
curl --max-time 60 -sS -o /dev/null -w 'sales=%{http_code}\n' http://127.0.0.1:3000/s/preaudit202511
curl --max-time 60 -sS -o /dev/null -w 'admin=%{http_code}\n' http://127.0.0.1:3000/admin
```

Expected: `sales=200` and `admin=200`.

- [ ] **Step 4: Confirm secret hygiene**

Run:

```bash
git check-ignore -q .env.local
! git ls-files --error-unmatch .env.local
! rg -n 'sk-[A-Za-z0-9]{16,}' README.md src docs/superpowers
```

Expected: all commands exit zero and no secret is printed.

- [ ] **Step 5: Commit and push**

```bash
git add README.md docs/superpowers/plans/2026-07-23-five-round-sales-interview-implementation.md
git commit -m "docs: explain five-round sales interview"
git push
```

Expected: `codex/preaudit-fixed-template` is synchronized with its GitHub remote.
