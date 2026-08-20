# Project Review Tracking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tracking directly behind risk conclusions for approved projects, derive read-only approval facts automatically, capture auditable special-approval items, and conditionally expose supplier tracking.

**Architecture:** Add the special-approval value to the external approval aggregate and derive approval facts through focused helpers in `tracking-fields.ts`. Keep immutable snapshots limited to time-varying fields; compose derived facts with the latest snapshot for UI and Excel. Supplier applicability is calculated once from procurement participation or triggered procurement risks and enforced consistently in UI, manual snapshots, imports, and exports.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Zod, Vitest, SheetJS, fflate.

---

### Task 1: Capture auditable special-approval items

**Files:**
- Modify: `src/domain/preaudit/types.ts`
- Modify: `src/domain/preaudit/external-approval.ts`
- Modify: `src/domain/preaudit/repository.ts`
- Modify: `src/domain/preaudit/service.ts`
- Modify: `src/app/api/admin/projects/[id]/external-approval/route.ts`
- Modify: `src/components/admin/ExternalApprovalPanel.tsx`
- Test: `src/domain/preaudit/__tests__/external-approval.test.ts`
- Test: `src/domain/preaudit/__tests__/tracking-routes.test.ts`

- [ ] **Step 1: Write failing domain tests**

Add tests proving approved and conditional decisions require a dedicated value while rejected decisions do not:

```ts
expect(() => buildExternalApproval({
  decision: 'approved',
  decisionDate: '2026-07-29',
  recordedBy: '审核人',
}, now, 'event-1')).toThrow('已完成审批或有条件准入时必须填写特批事项');

expect(buildExternalApproval({
  decision: 'approved',
  decisionDate: '2026-07-29',
  recordedBy: '审核人',
  specialApprovalItems: '回款节点须按月跟踪',
}, now, 'event-1')).toMatchObject({
  specialApprovalItems: '回款节点须按月跟踪',
  history: [{ specialApprovalItems: '回款节点须按月跟踪' }],
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/domain/preaudit/__tests__/external-approval.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts
```

Expected: FAIL because `specialApprovalItems` is absent from the input, aggregate, event, and route.

- [ ] **Step 3: Add the model and validation**

Extend the types:

```ts
export interface ExternalApprovalEvent {
  // existing properties
  specialApprovalItems?: string;
}

export interface ExternalApprovalDecision {
  // existing properties
  specialApprovalItems?: string;
}
```

Extend `RecordExternalApprovalInput`, normalize the value, and require it when the decision is `approved` or `conditional`:

```ts
const specialApprovalItems = input.specialApprovalItems?.trim() || undefined;
if (input.decision !== 'rejected' && !specialApprovalItems) {
  throw new ExternalApprovalError('已完成审批或有条件准入时必须填写特批事项');
}
```

Persist the value on both the decision and its `recorded` event. Make the Zod properties optional so existing projects remain readable.

- [ ] **Step 4: Wire the API and form**

Read `specialApprovalItems` in the route and send it from `ExternalApprovalPanel`. Show a full-width textarea only for approved or conditional decisions, mark it required, and include it in the submit button disabled condition.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same focused command. Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/preaudit/types.ts src/domain/preaudit/external-approval.ts src/domain/preaudit/repository.ts src/domain/preaudit/service.ts src/app/api/admin/projects/[id]/external-approval/route.ts src/components/admin/ExternalApprovalPanel.tsx src/domain/preaudit/__tests__/external-approval.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts
git commit -m "feat: capture special approval items"
```

### Task 2: Separate derived approval facts from mutable tracking values

**Files:**
- Modify: `src/domain/preaudit/tracking-fields.ts`
- Modify: `src/domain/preaudit/tracking-service.ts`
- Test: `src/domain/preaudit/__tests__/tracking-model.test.ts`
- Test: `src/domain/preaudit/__tests__/tracking-service.test.ts`

- [ ] **Step 1: Write failing mapping tests**

Add a fixture with approval answers, narratives, financing values, and special-approval items. Assert:

```ts
expect(trackingDerivedValues(project)).toMatchObject({
  salesBu: '政企BU',
  salesRegion: '华东区',
  salesManager: '张三',
  projectName: '安徽广电项目',
  customerName: '安徽广电集团',
  contractAmountCny: 20_000_000,
  approvedGm1: 12.5,
  specialApprovalItems: '按月跟踪回款',
  financingSituation: '直接垫资 1000000 元，期限 6 个月',
});
expect(isSupplierTrackingApplicable(project)).toBe(true);
```

Add a non-procurement fixture and assert false.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/domain/preaudit/__tests__/tracking-model.test.ts src/domain/preaudit/__tests__/tracking-service.test.ts
```

Expected: FAIL because derived-value and supplier-applicability helpers do not exist.

- [ ] **Step 3: Mark field ownership**

Extend `TrackingFieldDefinition`:

```ts
ownership: 'system' | 'derived' | 'snapshot';
```

Set basic approval facts, `specialApprovalItems`, `financingSituation`, and `projectSummary` to `derived`; system status/date/sequence to `system`; all time-varying fields to `snapshot`.

- [ ] **Step 4: Implement deterministic derivation**

Add:

```ts
export function trackingDerivedValues(project: PreauditProject): Record<string, TrackingFieldValue>
export function isSupplierTrackingApplicable(project: PreauditProject): boolean
export function trackingDisplayValues(project: PreauditProject): Record<string, TrackingFieldValue>
```

`trackingDisplayValues` merges derived values with the latest snapshot, but derived values win over stale copies from old snapshots.

Generate financing text in this priority:

1. `financingOverview`
2. “未涉及垫资” when `hasFinancing === false`
3. structured direct/potential amounts and duration
4. “审批资料未填写”

- [ ] **Step 5: Enforce snapshot ownership and supplier applicability**

Change snapshot normalization to reject any field whose ownership is not `snapshot`. When supplier tracking is not applicable, reject `procurement` fields with:

```ts
throw new TrackingServiceError('INVALID_TRACKING_INPUT', '当前项目不涉及采购，不能填写供应商跟踪字段');
```

Remove derived defaults from snapshot persistence; first snapshots contain only submitted time-varying values.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the focused command and confirm all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/preaudit/tracking-fields.ts src/domain/preaudit/tracking-service.ts src/domain/preaudit/__tests__/tracking-model.test.ts src/domain/preaudit/__tests__/tracking-service.test.ts
git commit -m "refactor: derive tracking approval facts"
```

### Task 3: Place tracking behind risks and render the approved single-page layout

**Files:**
- Modify: `src/components/admin/ProjectReviewPanel.tsx`
- Modify: `src/components/admin/ProjectTrackingPanel.tsx`
- Test: `src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Read the component sources and assert:

```ts
expect(reviewPanel.indexOf('<ProjectTrackingPanel')).toBeGreaterThan(reviewPanel.indexOf('aria-labelledby="risk-heading"'));
expect(reviewPanel.indexOf('<ProjectTrackingPanel')).toBeLessThan(reviewPanel.indexOf('aria-labelledby="fields-heading"'));
expect(trackingPanel).toContain('来自审批资料');
expect(trackingPanel).toContain('isSupplierTrackingApplicable');
expect(trackingPanel).not.toContain('TRACKING_FIELDS.filter((field) => !field.systemControlled)');
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- --run src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts
```

Expected: FAIL because tracking is currently rendered at the bottom and all non-system fields are editable.

- [ ] **Step 3: Move the tracking component**

Render `ProjectTrackingPanel` immediately after the risk section. Keep its internal status guard so only `tracking` and `tracking_completed` projects show it. Remove the old bottom rendering and move “项目跟踪” directly behind “风险结论” in sticky navigation only when the project is trackable.

- [ ] **Step 4: Render read-only approval facts**

Use `trackingDerivedValues(project)` to display the derived `basic` and derived `overview` fields in a restrained read-only block with a “来自审批资料” label. Do not create input controls for these fields.

- [ ] **Step 5: Render editable sections**

Build editable fields from:

```ts
TRACKING_FIELDS.filter((field) =>
  field.ownership === 'snapshot'
  && (field.section !== 'procurement' || supplierApplicable)
)
```

Keep signing, collection, delivery, and feedback visible. Show supplier tracking only when applicable. Preserve the existing date/operator/note controls, immutable history, and tracking completion action.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run the focused command and confirm it passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ProjectReviewPanel.tsx src/components/admin/ProjectTrackingPanel.tsx src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts
git commit -m "feat: integrate tracking into project review"
```

### Task 4: Compose Excel imports and exports with approval facts

**Files:**
- Modify: `src/domain/preaudit/tracking-workbook.ts`
- Test: `src/domain/preaudit/__tests__/tracking-workbook.test.ts`
- Test: `src/domain/preaudit/__tests__/tracking-export.test.ts`

- [ ] **Step 1: Write failing export tests**

Create a project whose old snapshot contains incorrect copies of basic fields and assert the export uses approval facts:

```ts
expect(main.E3.v).toBe('政企BU');
expect(main.H3.v).toBe('安徽广电项目');
expect(main.K3.v).toBe('按月跟踪回款');
expect(main.L3.v).toContain('垫资');
```

For a non-procurement project, assert `AG3:AJ3` are empty.

- [ ] **Step 2: Write failing import tests**

Add a non-procurement project and a workbook row containing `AG:AJ` values. Assert the row is invalid with:

```ts
expect(row.errors).toContain('当前项目不涉及采购，不能导入供应商跟踪字段');
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --run src/domain/preaudit/__tests__/tracking-workbook.test.ts src/domain/preaudit/__tests__/tracking-export.test.ts
```

Expected: FAIL because export currently reads basic facts from snapshots and import accepts procurement columns for every project.

- [ ] **Step 4: Update export composition**

Replace snapshot-only lookup with `trackingDisplayValues(project)`. Keep the customer workbook sheet order, formatting, hidden project ID, and current output column order unchanged.

- [ ] **Step 5: Validate supplier imports**

After matching a row to one project, detect any non-empty procurement values. If supplier tracking is not applicable, append the explicit error and mark the row invalid.

Derived columns in uploaded files remain usable for matching and preview, but they are not written into new snapshots.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the focused command and confirm all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/preaudit/tracking-workbook.ts src/domain/preaudit/__tests__/tracking-workbook.test.ts src/domain/preaudit/__tests__/tracking-export.test.ts
git commit -m "feat: align tracking workbooks with approval facts"
```

### Task 5: Full verification and runtime check

**Files:**
- Verify all files changed in Tasks 1–4.

- [ ] **Step 1: Run the complete automated suite**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all tests pass, lint/typecheck report no errors, and the production build exits with code 0.

- [ ] **Step 2: Restart the local project**

Stop the existing Next.js development process and run:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Expected: server reports ready and `/admin` returns HTTP 200.

- [ ] **Step 3: Validate the workflow in a browser**

Verify:

- Approved project: tracking appears immediately after risk conclusions.
- Basic and approval-overview facts are visibly read-only.
- Procurement project: supplier section appears.
- Non-procurement project: supplier section is absent.
- Tracking snapshot can be saved and appears as a locked history record.

- [ ] **Step 4: Validate an exported workbook**

Download `/api/admin/tracking/export`, open it with OpenPyXL or LibreOffice, and confirm the seven customer sheets, basic facts, special-approval items, conditional supplier cells, and hidden system project ID.

- [ ] **Step 5: Commit any verification-only corrections**

Stage only files belonging to this feature and commit with a focused `fix:` message. Preserve unrelated changes in `next.config.ts`, `.superpowers/`, and `src/domain/preaudit/__tests__/next-config.test.ts`.
