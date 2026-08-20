# 数据分析与组织配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加 BG/BU/销售区域配置、销售端级联选择、项目执行结论、系统预警，以及可按组织逐级下钻的管理端数据分析页面。

**Architecture:** 组织配置使用独立 JSON 仓储并由服务端统一校验；项目事实继续保存在现有项目仓储。统计领域模块接收项目和组织配置，纯函数生成指标、分布、下钻与预警，API 只负责筛选参数解析和聚合结果输出。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Zod、Vitest、Tailwind CSS 4、文件型 JSON 持久化。

---

## 文件结构

- `src/domain/preaudit/organization-config.ts`：组织节点类型、默认映射、校验、查询与文件仓储。
- `src/domain/preaudit/tracking-analytics.ts`：OT 项目分类、统计聚合、预警和组织下钻。
- `src/components/admin/AnalyticsPanel.tsx`：统计筛选、指标、分布、下钻和预警 UI。
- `src/components/admin/OrganizationConfigPanel.tsx`：BG、BU、区域配置 UI。
- `src/app/api/admin/analytics/route.ts`：统计聚合接口。
- `src/app/api/admin/organization-config/route.ts`：读取与新增组织配置。
- `src/app/api/admin/organization-config/[id]/route.ts`：编辑、移动和启停组织节点。
- 现有 `types.ts`、`repository.ts`、`bootstrap.ts`、`service.ts`、跟踪路由和销售入口负责兼容新增字段。

### Task 1: 组织配置领域与文件仓储

**Files:**
- Create: `src/domain/preaudit/organization-config.ts`
- Create: `src/domain/preaudit/__tests__/organization-config.test.ts`
- Modify: `src/domain/preaudit/bootstrap.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('ships the approved BG and BU hierarchy', () => {
  const config = defaultOrganizationConfig();
  expect(enabledBus(config, 'TSG').map((item) => item.name)).toEqual(['CMC', 'CUC', 'CTC', 'AIO']);
  expect(resolveOrganization(config, 'AIS', '')?.bg.name).toBe('DIG');
});

it('rejects duplicate sibling names and active children under disabled parents', async () => {
  const repository = await repositoryFixture();
  await expect(repository.create({ type: 'bu', name: 'CMC', parentId: tsgId }))
    .rejects.toMatchObject({ code: 'ORGANIZATION_CONFIG_INVALID' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/organization-config.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现模型、默认数据和原子写入仓储**

```ts
export type OrganizationNodeType = 'bg' | 'bu' | 'region';
export interface OrganizationNode {
  id: string;
  type: OrganizationNodeType;
  name: string;
  parentId?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BG_BU = {
  TSG: ['CMC', 'CUC', 'CTC', 'AIO'],
  DIG: ['SIO', 'AID', 'AIS'],
  SIG: ['ESU', 'SSU'],
  CSU: ['CSU'],
} as const;
```

实现 `FileOrganizationConfigRepository.initialize/list/create/update`、同级名称唯一、父子类型校验、父级停用约束、软停用和 `resolveOrganization`。在 `bootstrap.ts` 暴露单例 `getOrganizationConfigRepository()`，文件固定为 `data/state/organization-config.json`。

- [ ] **Step 4: 运行测试**

Run: `npm test -- src/domain/preaudit/__tests__/organization-config.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/preaudit/organization-config.ts src/domain/preaudit/__tests__/organization-config.test.ts src/domain/preaudit/bootstrap.ts
git commit -m "feat: add organization configuration domain"
```

### Task 2: 组织配置 API 与销售端级联选择

**Files:**
- Create: `src/app/api/admin/organization-config/route.ts`
- Create: `src/app/api/admin/organization-config/[id]/route.ts`
- Create: `src/domain/preaudit/__tests__/organization-config-routes.test.ts`
- Modify: `src/app/api/s/[token]/route.ts`
- Modify: `src/app/api/s/[token]/start/route.ts`
- Modify: `src/domain/preaudit/service.ts`
- Modify: `src/components/sales/WelcomePage.tsx`
- Modify: `src/app/s/[token]/page.tsx`

- [ ] **Step 1: 写 API 和销售身份失败测试**

```ts
it('returns enabled hierarchy with the sales template', async () => {
  const response = await GET_TEMPLATE(request, context);
  const body = await response.json();
  expect(body.organization.bgs[0]).toMatchObject({ name: 'TSG' });
});

it('rejects an invalid BU and region combination', async () => {
  await expect(service.startProject(token, '张三', template, {
    salesBu: 'CMC', salesRegion: '不存在区域',
  })).rejects.toMatchObject({ code: 'INVALID_SALES_ORGANIZATION' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/organization-config-routes.test.ts src/domain/preaudit/__tests__/service.test.ts`

Expected: FAIL，模板响应没有组织配置且服务未校验组合。

- [ ] **Step 3: 实现接口、派生 BG 和级联表单**

销售模板响应增加：

```ts
organization: {
  bgs: OrganizationNode[];
  bus: OrganizationNode[];
  regions: OrganizationNode[];
}
```

`WelcomePage` 使用 BU 下拉，自动显示只读 BG，并按 BU 过滤销售区域。开始项目时服务端再次校验并保存：

```ts
answers.salesBg = { value: resolved.bg.name, source: 'sales', updatedAt: now };
answers.salesBu = { value: resolved.bu.name, source: 'sales', updatedAt: now };
answers.salesRegion = { value: resolved.region.name, source: 'sales', updatedAt: now };
```

历史无区域配置时仅允许恢复已有项目，新的销售提交必须使用启用组合。

- [ ] **Step 4: 运行相关测试**

Run: `npm test -- src/domain/preaudit/__tests__/organization-config-routes.test.ts src/domain/preaudit/__tests__/service.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/admin/organization-config src/app/api/s src/domain/preaudit/service.ts src/components/sales/WelcomePage.tsx src/app/s
git commit -m "feat: connect sales identity to organization config"
```

### Task 3: 跟踪执行状态与结束结论

**Files:**
- Modify: `src/domain/preaudit/types.ts`
- Modify: `src/domain/preaudit/repository.ts`
- Modify: `src/domain/preaudit/tracking-service.ts`
- Modify: `src/domain/preaudit/service.ts`
- Modify: `src/app/api/admin/projects/[id]/tracking/snapshots/route.ts`
- Modify: `src/app/api/admin/projects/[id]/tracking/complete/route.ts`
- Modify: `src/components/admin/ProjectTrackingPanel.tsx`
- Modify: `src/domain/preaudit/__tests__/tracking-service.test.ts`
- Modify: `src/domain/preaudit/__tests__/tracking-routes.test.ts`

- [ ] **Step 1: 写结论校验失败测试**

```ts
it('requires a reason for breached and at-risk snapshots', () => {
  expect(() => buildTrackingSnapshot(project, {
    effectiveDate: '2026-07-30',
    values: {},
    executionHealth: 'at_risk',
    executionHealthReason: '',
    source: 'manual',
    createdBy: '管理员',
  }, 'snapshot-1', now)).toThrow('请填写执行状态说明');
});

it('requires a completion reason when commitments were not achieved', async () => {
  await expect(service.completeTracking(project.id, {
    completedBy: '管理员', note: '结束', completionOutcome: 'not_achieved',
    completionOutcomeReason: '',
  })).rejects.toMatchObject({ code: 'INVALID_TRACKING_INPUT' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-service.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts`

Expected: FAIL，新增属性和校验尚不存在。

- [ ] **Step 3: 扩展类型、Zod 兼容解析、服务和页面**

```ts
export type ExecutionHealth = 'normal' | 'breached' | 'at_risk';
export type CompletionOutcome = 'achieved' | 'not_achieved';
```

快照增加 `executionHealth`、`executionHealthReason`；台账增加 `completionOutcome`、`completionOutcomeReason`。仓储字段全部保持可选以读取历史数据；新建快照必须选择状态，`breached/at_risk` 必须填写原因；结束跟踪必须选择结论，未达成必须填写原因。UI 在保存区和结束区提供清晰单选项及条件说明框，历史记录展示已锁定状态。

- [ ] **Step 4: 运行测试**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-service.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/preaudit/types.ts src/domain/preaudit/repository.ts src/domain/preaudit/tracking-service.ts src/domain/preaudit/service.ts src/app/api/admin/projects src/components/admin/ProjectTrackingPanel.tsx src/domain/preaudit/__tests__/tracking-service.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts
git commit -m "feat: capture tracking execution outcomes"
```

### Task 4: 统计分类、比例、预警与组织下钻

**Files:**
- Create: `src/domain/preaudit/tracking-analytics.ts`
- Create: `src/domain/preaudit/__tests__/tracking-analytics.test.ts`

- [ ] **Step 1: 写完整领域矩阵失败测试**

```ts
it('separates OT, execution and historical incomplete outcomes', () => {
  const result = buildTrackingAnalytics(projects, organization, {});
  expect(result.metrics).toMatchObject({
    otTotal: 7, enteredExecution: 4, tracking: 2, completed: 2, notEnteredExecution: 3,
  });
  expect(result.completedDistribution).toMatchObject({
    achieved: 1, notAchieved: 0, pendingEntry: 1,
  });
  expect(result.ratios.completed).toBe(50);
});

it('keeps human status primary and emits independent system warnings', () => {
  const result = buildTrackingAnalytics([projectWithFullCollection], organization, {});
  expect(result.trackingDistribution.normal).toBe(1);
  expect(result.warnings).toContainEqual(expect.objectContaining({ ruleId: 'COLLECTION_REACHED_CONTRACT' }));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-analytics.test.ts`

Expected: FAIL，统计模块尚不存在。

- [ ] **Step 3: 实现纯函数聚合**

```ts
export interface AnalyticsFilters {
  bgId?: string;
  buId?: string;
  regionId?: string;
  salesName?: string;
  status?: 'tracking' | 'tracking_completed' | 'not_entered';
  from?: string;
  to?: string;
}

export function buildTrackingAnalytics(
  projects: PreauditProject[],
  organization: OrganizationNode[],
  filters: AnalyticsFilters,
  now = new Date(),
): TrackingAnalyticsResult;
```

实现 OT 状态集合、历史 BG 动态归属、最新快照、所有比例零分母返回 `null`、BG→BU→销售→项目分组，以及规则 `COLLECTION_REACHED_CONTRACT`、`FORECAST_GM1_BELOW_APPROVED`、`RECEIVABLE_OVERDUE`、`MILESTONE_OVERDUE`。日期按 `Asia/Shanghai` 的日边界比较。

- [ ] **Step 4: 运行测试**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-analytics.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/preaudit/tracking-analytics.ts src/domain/preaudit/__tests__/tracking-analytics.test.ts
git commit -m "feat: add tracking analytics engine"
```

### Task 5: 数据分析 API

**Files:**
- Create: `src/app/api/admin/analytics/route.ts`
- Create: `src/domain/preaudit/__tests__/analytics-route.test.ts`

- [ ] **Step 1: 写筛选解析和响应失败测试**

```ts
it('returns server-side aggregates for linked filters', async () => {
  const response = await GET(new Request('http://localhost/api/admin/analytics?bgId=bg-tsg&buId=bu-cmc'));
  const body = await response.json();
  expect(body.filters).toMatchObject({ bgId: 'bg-tsg', buId: 'bu-cmc' });
  expect(body.metrics.otTotal).toBeTypeOf('number');
});

it('rejects invalid date ranges', async () => {
  const response = await GET(new Request('http://localhost/api/admin/analytics?from=2026-08-01&to=2026-07-01'));
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/analytics-route.test.ts`

Expected: FAIL，路由尚不存在。

- [ ] **Step 3: 实现服务端聚合路由**

解析并校验 `bgId/buId/regionId/salesName/status/from/to`，读取项目及组织配置，调用 `buildTrackingAnalytics`，返回 `{ filters, organization, metrics, ratios, distributions, groups, warnings }`。非法层级组合或日期返回现有统一错误格式。

- [ ] **Step 4: 运行测试**

Run: `npm test -- src/domain/preaudit/__tests__/analytics-route.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/admin/analytics/route.ts src/domain/preaudit/__tests__/analytics-route.test.ts
git commit -m "feat: expose tracking analytics API"
```

### Task 6: 管理端数据分析页面

**Files:**
- Create: `src/components/admin/AnalyticsPanel.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/domain/preaudit/__tests__/analytics-presentation.test.ts`

- [ ] **Step 1: 写展示转换失败测试**

```ts
it('formats null ratios as dash and retains numeric evidence', () => {
  expect(formatAnalyticsRatio(null)).toBe('—');
  expect(formatAnalyticsRatio(37.5)).toBe('37.5%');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/analytics-presentation.test.ts`

Expected: FAIL，展示模块尚不存在。

- [ ] **Step 3: 实现响应式统计页和导航**

增加导航顺序 `项目跟踪 → 数据分析 → 审批模板 → 系统设置`。页面包含联动筛选、六张指标卡、两组带数字标签的水平比例条、面包屑下钻表和预警清单；点击项目调用现有 `onOpenProject`。移动端指标卡两列、表格置于可滚动容器，颜色外同时提供文字标签。

- [ ] **Step 4: 运行测试和 lint**

Run: `npm test -- src/domain/preaudit/__tests__/analytics-presentation.test.ts && npm run lint`

Expected: PASS 且 ESLint 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/admin/AnalyticsPanel.tsx src/app/admin/page.tsx src/app/globals.css src/domain/preaudit/__tests__/analytics-presentation.test.ts
git commit -m "feat: add admin data analytics dashboard"
```

### Task 7: 管理端数据配置页面

**Files:**
- Create: `src/components/admin/OrganizationConfigPanel.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `src/domain/preaudit/__tests__/organization-presentation.test.ts`

- [ ] **Step 1: 写树形展示失败测试**

```ts
it('groups enabled and disabled children under their configured parent', () => {
  const tree = organizationTree(nodes);
  expect(tree[0].children[0]).toMatchObject({ name: 'CMC', enabled: true });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/organization-presentation.test.ts`

Expected: FAIL，展示函数尚不存在。

- [ ] **Step 3: 实现最后一项导航和配置工作台**

页面将 BG、BU、销售区域分成三级列表，支持新增、改名、移动、排序、启停和“补充默认映射”。危险操作显示被引用提示且只做停用；保存后重新请求配置并用成功提示确认。将“数据配置”放在所有主导航最后。

- [ ] **Step 4: 运行测试和 lint**

Run: `npm test -- src/domain/preaudit/__tests__/organization-presentation.test.ts && npm run lint`

Expected: PASS 且 ESLint 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/admin/OrganizationConfigPanel.tsx src/app/admin/page.tsx src/domain/preaudit/__tests__/organization-presentation.test.ts
git commit -m "feat: add organization configuration workspace"
```

### Task 8: 回归、构建与真实页面验收

**Files:**
- Modify only if verification exposes defects in files from Tasks 1–7.

- [ ] **Step 1: 运行完整自动化测试**

Run: `npm test`

Expected: 全部测试 PASS；不得修改或删除现有 `next.config.ts` 和 `next-config.test.ts` 用户改动。

- [ ] **Step 2: 运行静态检查和生产构建**

Run: `npm run lint && npm run build`

Expected: ESLint、TypeScript 和 Next.js build 全部成功。

- [ ] **Step 3: 启动本地服务并检查销售端**

Run: `npm run dev`

Expected: 销售端 BU 为下拉；选择 BU 后显示派生 BG，并只出现相应区域；非法组合不能提交。

- [ ] **Step 4: 检查后台完整流程**

在真实浏览器确认：

1. 新建组织区域并在销售端出现；
2. 跟踪快照可保存三种人工执行状态；
3. 回款达到合同金额出现“建议结束跟踪”；
4. 结束跟踪必须选择达成/未达成；
5. 数据分析的 BG→BU→销售→项目数量与案例数据一致；
6. 数据配置是侧栏最后一项，移动端无横向布局破坏。

- [ ] **Step 5: 检查 Excel 兼容**

Run: `npm test -- src/domain/preaudit/__tests__/tracking-workbook.test.ts src/domain/preaudit/__tests__/tracking-imports.test.ts src/domain/preaudit/__tests__/tracking-export.test.ts`

Expected: 现有模板导入导出测试全部 PASS，工作簿列结构不变。

- [ ] **Step 6: 提交验证修复**

```bash
git add src/domain/preaudit/organization-config.ts src/domain/preaudit/tracking-analytics.ts src/components/admin/AnalyticsPanel.tsx src/components/admin/OrganizationConfigPanel.tsx src/app/api/admin/analytics src/app/api/admin/organization-config src/app/api/s src/app/admin/page.tsx src/app/globals.css src/domain/preaudit/types.ts src/domain/preaudit/repository.ts src/domain/preaudit/bootstrap.ts src/domain/preaudit/service.ts src/domain/preaudit/tracking-service.ts src/app/api/admin/projects src/components/admin/ProjectTrackingPanel.tsx src/domain/preaudit/__tests__/organization-config.test.ts src/domain/preaudit/__tests__/organization-config-routes.test.ts src/domain/preaudit/__tests__/tracking-service.test.ts src/domain/preaudit/__tests__/tracking-routes.test.ts src/domain/preaudit/__tests__/tracking-analytics.test.ts src/domain/preaudit/__tests__/analytics-route.test.ts src/domain/preaudit/__tests__/analytics-presentation.test.ts src/domain/preaudit/__tests__/organization-presentation.test.ts
git commit -m "fix: harden analytics and organization workflows"
```
