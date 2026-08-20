# Sales Guided Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sales interview's first question batch with a guided free-form project introduction, map that answer across the fixed Excel fields, and ask only unresolved questions within the existing five-round limit.

**Architecture:** Keep `ToolLoopAgent`, persistence, deterministic risk evaluation, and Excel export unchanged. Add first-round metadata to the interview batching domain, let the existing extractor scan the complete answer, and render the guidance from domain-derived state in the client UI.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, AI SDK `ToolLoopAgent`, Vitest, Tailwind CSS.

---

## File map

- `src/domain/preaudit/interview-batches.ts`: owns first-round guidance, round detection, and remaining-field batches.
- `src/domain/preaudit/agent.ts`: instructs the model to extract every explicit field from the free-form introduction.
- `src/components/sales/VoiceChatPanel.tsx`: renders the first-round outline and phase-specific status/input copy.
- `src/components/sales/WelcomePage.tsx`: explains the new two-stage collection flow.
- `src/app/s/[token]/page.tsx`: updates the new-project notice.
- `src/domain/preaudit/__tests__/interview-batches.test.ts`: verifies first-round behavior and five-round boundaries.
- `src/domain/preaudit/__tests__/chat-route.test.ts`: verifies canonical batch output remains enforced.

### Task 1: Make the first batch a guided project introduction

**Files:**
- Modify: `src/domain/preaudit/interview-batches.ts`
- Test: `src/domain/preaudit/__tests__/interview-batches.test.ts`

- [ ] **Step 1: Replace the old first-batch expectations with failing guided-intake tests**

Add assertions equivalent to:

```ts
expect(batch.round).toBe(1);
expect(batch.introductionRound).toBe(true);
expect(batch.questions).toEqual([
  expect.objectContaining({
    id: 'project-introduction',
    fieldKeys: [],
  }),
]);
expect(formatInterviewBatch(batch, '张三')).toContain('先完整介绍一下这个项目');
expect(formatInterviewBatch(batch, '张三')).toContain('项目与合同基本情况');
expect(formatInterviewBatch(batch, '张三')).not.toContain('请按编号一起回答');
```

Add a compatibility test showing `hasBatchedInterviewStarted` recognizes both the legacy `第 1/5 轮，请按编号一起回答` message and the new `第 1/5 轮｜项目介绍` message.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: FAIL because `introductionRound` and the new batch copy do not exist.

- [ ] **Step 3: Implement the introduction batch**

Extend `InterviewBatch`:

```ts
introductionRound: boolean;
```

Define:

```ts
export const PROJECT_INTRODUCTION_OUTLINE = [
  '项目与合同基本情况',
  '客户、最终用户和销售归属',
  '资金来源、付款及签约链条',
  '采购、供应商、交付和垫资情况',
  '项目价值、风险管控与承诺',
] as const;
```

When no new-flow round has completed, return one question:

```ts
{
  id: 'project-introduction',
  fieldKeys: [],
  question: '请结合下方提纲，先完整介绍一下这个项目。已说明的信息会自动填写到审批表，后续只补问缺少的内容。',
}
```

Format the first message with heading `第 1/5 轮｜项目介绍`, the open question, and the five outline entries. Keep rounds 2–5 based on unanswered applicable groups. Detect both legacy and new first-batch headings so resumed records retain correct round counts.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/interview-batches.test.ts
```

Expected: all interview batch tests pass.

- [ ] **Step 5: Commit the domain change**

```bash
git add src/domain/preaudit/interview-batches.ts src/domain/preaudit/__tests__/interview-batches.test.ts
git commit -m "feat: guide the first sales intake round"
```

### Task 2: Make whole-answer extraction explicit

**Files:**
- Modify: `src/domain/preaudit/agent.ts`
- Test: `src/domain/preaudit/__tests__/chat-route.test.ts`

- [ ] **Step 1: Add a failing source-level instruction assertion**

Export the instruction builder as `buildPreauditAgentInstructions(project)` and assert that its result contains:

```ts
expect(instructions).toContain('扫描销售整段回答');
expect(instructions).toContain('不限于当前提纲');
expect(instructions).toContain('不得重复追问已有值');
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/chat-route.test.ts
```

Expected: FAIL because the instruction builder is not exported and the explicit rules are absent.

- [ ] **Step 3: Extract and update the instruction builder**

Move the instruction string into:

```ts
export function buildPreauditAgentInstructions(
  project: PreauditProject,
  fieldDescription: string,
  collected: string,
): string
```

Add these strict rules:

```text
销售第一轮会按提纲自由介绍项目。每轮都要扫描销售整段回答，提取其中明确出现的所有模板字段，不限于当前提纲或上一批问题。
保存后只追问持久化项目中仍缺失且适用的字段，不得重复追问已有值。
```

Keep the tool order and canonical `getNextInterviewBatch` response rules unchanged.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/chat-route.test.ts
```

Expected: all chat/agent instruction tests pass.

- [ ] **Step 5: Commit the Agent change**

```bash
git add src/domain/preaudit/agent.ts src/domain/preaudit/__tests__/chat-route.test.ts
git commit -m "fix: extract all fields from sales introductions"
```

### Task 3: Present the introduction outline in the sales UI

**Files:**
- Modify: `src/components/sales/VoiceChatPanel.tsx`
- Modify: `src/components/sales/WelcomePage.tsx`
- Modify: `src/app/s/[token]/page.tsx`

- [ ] **Step 1: Derive first-round state without duplicating server rules**

Import `PROJECT_INTRODUCTION_OUTLINE` and determine whether the project has any sales answer:

```ts
const isIntroductionRound = !project.messages.some((message) => message.role === 'user');
```

This keeps resumed conversations from showing the outline again.

- [ ] **Step 2: Render the outline card**

Above the conversation composer, render an accessible section only during the introduction round:

```tsx
<section aria-labelledby="project-introduction-title">
  <p id="project-introduction-title">介绍时可以从这些方面展开</p>
  <ol>
    {PROJECT_INTRODUCTION_OUTLINE.map((item, index) => (
      <li key={item}><span>{index + 1}</span>{item}</li>
    ))}
  </ol>
</section>
```

Use existing design tokens, compact spacing, and a responsive two-column grid at `sm` width.

- [ ] **Step 3: Update phase-specific copy**

Use:

```ts
const inputPlaceholder = isIntroductionRound
  ? '请完整介绍项目情况；可以一次说完或输入一段文字'
  : '补充本轮信息；Enter 发送';
```

Change streaming copy to “正在整理回答并匹配审批表字段…”. Update welcome copy to explain “先完整介绍，再智能补问”，and new-project notice to “请先根据提纲完整介绍项目情况。”

- [ ] **Step 4: Run lint and TypeScript build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the UI change**

```bash
git add src/components/sales/VoiceChatPanel.tsx src/components/sales/WelcomePage.tsx src/app/s/[token]/page.tsx
git commit -m "feat: show guided project introduction"
```

### Task 4: Verify the complete workflow

**Files:**
- Modify only if validation exposes an issue.

- [ ] **Step 1: Run all automated checks**

```bash
git diff --check
npm test
npm run lint
npm run build
```

Expected: no whitespace errors, all tests pass, lint exits 0, production build succeeds.

- [ ] **Step 2: Validate in a real browser**

Open `/s/preaudit202511` and verify:

- Welcome page says “先完整介绍，再智能补问”.
- A new sales name starts with one introduction task and five outline items.
- The first-round placeholder invites a complete project description.
- Desktop and 390px mobile widths have no horizontal overflow.

- [ ] **Step 3: Submit a multi-field introduction**

Submit one answer containing contract name, amount, customer, final user, procurement status, and project background. Verify the next assistant batch does not repeat those populated fields and the admin record contains their values.

- [ ] **Step 4: Final commit if browser fixes were needed**

If browser validation requires fixes, stage the exact modified sales-flow files shown by `git status --short`, then run:

```bash
git commit -m "fix: polish guided intake validation issues"
```

If validation requires no code changes, skip this commit.

- [ ] **Step 5: Push and fast-forward `main`**

```bash
git push origin codex/sales-guided-intake
git -C /Users/csdn/Documents/亚信/asiainfo-preaudit-voice merge --ff-only codex/sales-guided-intake
git -C /Users/csdn/Documents/亚信/asiainfo-preaudit-voice push origin main
```
