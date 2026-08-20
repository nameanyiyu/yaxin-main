# Contract Project Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add external approval outcomes, immutable project-tracking snapshots, Excel batch import/export, and an admin tracking workspace to the existing preaudit system.

**Architecture:** Extend `PreauditProject` with backward-compatible optional approval and tracking aggregates. Keep state transitions and mutations in focused domain services, keep workbook mapping in a separate adapter, and expose thin authenticated admin routes. The UI adds approval and tracking panels to project review plus a dedicated tracking-ledger tab.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, SheetJS (`xlsx`), `fflate`, Tailwind CSS.

---

### Task 1: Approval and tracking domain types

**Files:**
- Modify: `src/domain/preaudit/types.ts`
- Modify: `src/domain/preaudit/repository.ts`
- Modify: `src/domain/preaudit/state-machine.ts`
- Test: `src/domain/preaudit/__tests__/tracking-model.test.ts`
- Test: `src/domain/preaudit/__tests__/state-machine.test.ts`

- [ ] **Step 1: Write failing compatibility and transition tests**

Add tests that parse an old project without new aggregates, parse a project with an approval decision and snapshots, and assert:

```ts
expect(canTransition('pending_manual_submission', 'pending_external_decision')).toBe(true);
expect(canTransition('pending_external_decision', 'conditional_admission')).toBe(true);
expect(canTransition('conditional_admission', 'tracking')).toBe(true);
expect(canTransition('conditional_admission', 'rejected')).toBe(true);
expect(canTransition('tracking', 'tracking_completed')).toBe(true);
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-model.test.ts src/domain/preaudit/__tests__/state-machine.test.ts`

Expected: FAIL because the new states and schemas do not exist.

- [ ] **Step 3: Add focused types and schemas**

Add the new `ProjectStatus` values and define:

```ts
type ApprovalDecision = 'approved' | 'rejected' | 'conditional';
type TrackingStatus = 'not_started' | 'in_progress' | 'completed';
type TrackingFieldValue = string | number | boolean | null;

interface ProjectTrackingSnapshot {
  id: string;
  effectiveDate: string;
  source: 'manual' | 'excel_import' | 'migration';
  values: Record<string, TrackingFieldValue>;
  importBatchId?: string;
  contentFingerprint: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}
```

Make `externalApproval` and `tracking` optional in the repository schema so existing JSON remains readable.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-model.test.ts src/domain/preaudit/__tests__/state-machine.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/types.ts src/domain/preaudit/repository.ts src/domain/preaudit/state-machine.ts src/domain/preaudit/__tests__/tracking-model.test.ts src/domain/preaudit/__tests__/state-machine.test.ts
git commit -m "feat: add project tracking domain model"
```

### Task 2: External approval service

**Files:**
- Create: `src/domain/preaudit/external-approval.ts`
- Modify: `src/domain/preaudit/service.ts`
- Test: `src/domain/preaudit/__tests__/external-approval.test.ts`

- [ ] **Step 1: Write failing approval lifecycle tests**

Cover:

- manual submission moves to `pending_external_decision`;
- approved creates a `not_started` ledger and moves to `tracking`;
- rejected requires comments and moves to `rejected`;
- conditional requires reason and conditions;
- fulfilled conditional approval moves to `tracking`;
- failed conditional approval moves to `rejected`;
- every action appends an immutable history event.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/external-approval.test.ts`

Expected: FAIL because approval mutations do not exist.

- [ ] **Step 3: Implement minimal lifecycle operations**

Expose service methods:

```ts
recordExternalApproval(id, input): Promise<PreauditProject>
verifyAdmissionCondition(id, input): Promise<PreauditProject>
enableTrackingForLegacyProject(id, input): Promise<PreauditProject>
```

Normalize strings, validate required conditional/rejection fields, call `assertTransition`, append events, and save through the existing project mutation queue.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/external-approval.test.ts src/domain/preaudit/__tests__/service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/external-approval.ts src/domain/preaudit/service.ts src/domain/preaudit/__tests__/external-approval.test.ts
git commit -m "feat: add external approval lifecycle"
```

### Task 3: Immutable tracking snapshot service

**Files:**
- Create: `src/domain/preaudit/tracking-fields.ts`
- Create: `src/domain/preaudit/tracking-service.ts`
- Modify: `src/domain/preaudit/service.ts`
- Test: `src/domain/preaudit/__tests__/tracking-service.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

Test automatic project-field defaults, inheritance, `#CLEAR`, content fingerprint idempotency, stale base snapshot conflicts, correction notes, and tracking completion.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-service.test.ts`

Expected: FAIL because snapshot creation is unavailable.

- [ ] **Step 3: Implement field catalog and snapshot operations**

Define all 38 workbook fields plus `currentForecastGm1` and `profitCommitmentStatus`. Add:

```ts
createTrackingSnapshot(id, {
  effectiveDate,
  values,
  baseSnapshotId,
  source,
  importBatchId,
  note,
  createdBy,
}): Promise<PreauditProject>

completeTracking(id, { completedBy, note }): Promise<PreauditProject>
```

Canonicalize values before hashing. Empty input inherits; `#CLEAR` becomes `null`. If a fingerprint already exists, return the existing project without adding a snapshot.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/tracking-fields.ts src/domain/preaudit/tracking-service.ts src/domain/preaudit/service.ts src/domain/preaudit/__tests__/tracking-service.test.ts
git commit -m "feat: add immutable tracking snapshots"
```

### Task 4: Admin approval and tracking APIs

**Files:**
- Create: `src/app/api/admin/projects/[id]/external-approval/route.ts`
- Create: `src/app/api/admin/projects/[id]/external-approval/verify-condition/route.ts`
- Create: `src/app/api/admin/projects/[id]/tracking/route.ts`
- Create: `src/app/api/admin/projects/[id]/tracking/snapshots/route.ts`
- Create: `src/app/api/admin/projects/[id]/tracking/complete/route.ts`
- Modify: `src/domain/preaudit/http.ts`
- Test: `src/domain/preaudit/__tests__/tracking-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Verify admin authentication, JSON validation, lifecycle success, 404, 409 conflict, and readable Chinese business errors.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-routes.test.ts`

Expected: FAIL because routes are missing.

- [ ] **Step 3: Implement thin routes**

Each route must:

1. call the existing admin-auth guard;
2. parse JSON;
3. delegate to `PreauditService`;
4. return `{ project }`;
5. route domain errors through `errorResponse`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/projects src/domain/preaudit/http.ts src/domain/preaudit/__tests__/tracking-routes.test.ts
git commit -m "feat: expose tracking admin APIs"
```

### Task 5: Tracking workbook mapping and preview

**Files:**
- Create: `src/domain/preaudit/tracking-workbook.ts`
- Test: `src/domain/preaudit/__tests__/tracking-workbook.test.ts`
- Create from approved customer workbook: `data/templates/project-tracking-2026.xlsx`

- [ ] **Step 1: Write failing workbook tests**

Use `data/templates/project-tracking-2026.xlsx` and verify:

- required sheet and header detection;
- 38-column mapping;
- hidden `AN` project ID priority;
- fallback match by project code/opportunity number;
- exact normalized composite match;
- ambiguous and unmatched results;
- `#CLEAR`, dates, amounts, percentages, and enum validation;
- duplicate-date conflict detection.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-workbook.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement parser and preview model**

Return:

```ts
interface TrackingImportPreview {
  batchId: string;
  rows: TrackingImportPreviewRow[];
  summary: {
    matched: number;
    unmatched: number;
    ambiguous: number;
    invalid: number;
    stale: number;
  };
}
```

Do not perform fuzzy auto-matching. Preserve row numbers and report field-level errors.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-workbook.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/tracking-workbook.ts src/domain/preaudit/__tests__/tracking-workbook.test.ts data/templates/project-tracking-2026.xlsx
git commit -m "feat: parse tracking workbook imports"
```

### Task 6: Batch import persistence and routes

**Files:**
- Create: `src/domain/preaudit/tracking-imports.ts`
- Modify: `src/domain/preaudit/bootstrap.ts`
- Create: `src/app/api/admin/tracking/imports/preview/route.ts`
- Create: `src/app/api/admin/tracking/imports/[batchId]/confirm/route.ts`
- Test: `src/domain/preaudit/__tests__/tracking-imports.test.ts`

- [ ] **Step 1: Write failing batch tests**

Test multipart upload, persisted preview, selection of valid rows, idempotent confirmation, all-or-nothing system failure behavior, and explicit skipped/error rows.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-imports.test.ts`

Expected: FAIL because import batches are unavailable.

- [ ] **Step 3: Implement batch repository and routes**

Persist batches in `data/state/tracking-imports.json` with statuses `previewed`, `confirmed`, and `failed`. Confirm selected valid rows through the snapshot service and record each result.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-imports.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/tracking-imports.ts src/domain/preaudit/bootstrap.ts src/app/api/admin/tracking src/domain/preaudit/__tests__/tracking-imports.test.ts
git commit -m "feat: add tracking batch imports"
```

### Task 7: Original-format workbook export

**Files:**
- Modify: `src/domain/preaudit/tracking-workbook.ts`
- Create: `src/app/api/admin/tracking/export/route.ts`
- Test: `src/domain/preaudit/__tests__/tracking-export.test.ts`

- [ ] **Step 1: Write failing export tests**

Verify:

- sheet names and order remain unchanged;
- visible columns remain `B:AM`;
- `AN` is hidden and contains system IDs;
- latest snapshot is exported;
- approved projects go to the main sheet;
- rejected projects go to the rejection sheet;
- commitment progress contains forecast GM1 and profit outcome;
- BU and risk summaries reflect the exported project set.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-export.test.ts`

Expected: FAIL because export is unavailable.

- [ ] **Step 3: Implement template cloning export**

Load `PREAUDIT_TRACKING_TEMPLATE_PATH` or the bundled template. Clone the workbook, clear only managed data rows, write current results, preserve styles and merged headers, hide `AN`, and return a timestamped `.xlsx`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-export.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preaudit/tracking-workbook.ts src/app/api/admin/tracking/export/route.ts src/domain/preaudit/__tests__/tracking-export.test.ts
git commit -m "feat: export project tracking workbook"
```

### Task 8: Project approval and tracking UI

**Files:**
- Create: `src/components/admin/ExternalApprovalPanel.tsx`
- Create: `src/components/admin/ProjectTrackingPanel.tsx`
- Modify: `src/components/admin/ProjectReviewPanel.tsx`
- Modify: `src/components/admin/ProjectsPanel.tsx`
- Test: `src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Assert Chinese labels and state summaries for waiting decision, conditional verification, rejected, not started, tracking, and completed.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts`

Expected: FAIL because presentation helpers and panels are missing.

- [ ] **Step 3: Implement approval panel**

Add accessible fields for decision, date, reference, comments, conditional reason/conditions, and verification. Disable invalid actions and surface API errors inline.

- [ ] **Step 4: Implement tracking panel**

Group fields into signing, collection, delivery, procurement, and BU feedback. “新增本期跟踪” copies current values; confirmed history is read-only and grey. Require effective date and operator.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts
git commit -m "feat: add approval and tracking project panels"
```

### Task 9: Tracking ledger and import/export UI

**Files:**
- Create: `src/components/admin/TrackingLedgerPanel.tsx`
- Create: `src/components/admin/TrackingImportDialog.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/globals.css`
- Test: `src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts`

- [ ] **Step 1: Extend failing presentation tests**

Assert the navigation label, filter labels, import preview summary, disabled confirm state for blocking errors, and export action.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts`

Expected: FAIL for missing ledger UI.

- [ ] **Step 3: Implement ledger workspace**

Add “项目跟踪” navigation. Show filters for BU, region, sales manager, tracking status, approval result, and update date. Link rows back to project detail.

- [ ] **Step 4: Implement import/export controls**

Upload `.xlsx`, render row-level preview and changes, allow confirmation only for valid selected rows, and download the current filtered export.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/globals.css src/components/admin/TrackingLedgerPanel.tsx src/components/admin/TrackingImportDialog.tsx src/domain/preaudit/__tests__/admin-tracking-presentation.test.ts
git commit -m "feat: add project tracking workspace"
```

### Task 10: Regression, build, and browser verification

**Files:**
- Modify only files needed by failures found during verification.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint has no errors, and production build succeeds.

- [ ] **Step 2: Start the application**

Run: `npm run dev`

Expected: Next.js reports the local and current LAN HTTPS/HTTP addresses without compilation errors.

- [ ] **Step 3: Verify the lifecycle in a real browser**

Complete:

1. manual external approval;
2. conditional approval verification;
3. two tracking snapshots with the first locked;
4. workbook preview and confirm;
5. workbook export and re-import matching;
6. rejected-project export;
7. existing sales interview and risk-feedback regression.

- [ ] **Step 4: Inspect the exported workbook**

Open or render every populated worksheet. Verify no clipped headers, broken merges, lost styles, visible hidden IDs, or malformed dates/percentages.

- [ ] **Step 5: Commit verification fixes**

```bash
git add src/domain/preaudit src/app/api/admin src/components/admin src/app/admin/page.tsx src/app/globals.css
git commit -m "fix: harden project tracking workflow"
```
