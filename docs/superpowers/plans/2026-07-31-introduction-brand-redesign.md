# 亚信客户汇报介绍页去 AI 化重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有介绍页重做为具有亚信品牌建筑感、适合桌面客户汇报且可离线分享的单文件长页面。

**Architecture:** 保持 `public/introduction.html` 单文件交付，不引入构建依赖。用一套新的 HTML 章节结构和内联 CSS 取代旧的通用营销页结构，Logo 与产品界面证据继续以内嵌资源交付；测试通过稳定的结构标记和禁用样式断言防止回退。

**Tech Stack:** HTML5、CSS、少量原生 JavaScript、Vitest、Playwright CLI

---

## 文件结构

- `public/introduction.html`：唯一运行时页面，包含结构、样式、交互、内嵌 Logo 与界面证据。
- `src/domain/preaudit/__tests__/introduction-page.test.ts`：验证品牌结构、离线资源、关键文案与去 AI 化约束。
- `docs/superpowers/specs/2026-07-31-introduction-brand-redesign-design.md`：已确认设计规范。

### Task 1: 建立重设计测试边界

**Files:**
- Modify: `src/domain/preaudit/__tests__/introduction-page.test.ts`

- [ ] **Step 1: 写入结构与反模式断言**

在现有测试中断言新页面包含：

```ts
expect(html).toContain('data-brand-direction="architectural-c"');
expect(html).toContain('class="brand-structure"');
expect(html).toContain('class="control-chain"');
expect(html).toContain('class="product-evidence"');
expect(html).toContain('class="management-outcomes"');
expect(html).toContain('data:image/webp;base64,');
expect(html).not.toContain('backdrop-filter');
expect(html).not.toContain('background-clip: text');
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/introduction-page.test.ts
```

Expected: FAIL，缺少 `architectural-c`、`brand-structure` 等新结构。

- [ ] **Step 3: 检查失败原因只来自预期的新结构**

确认原有系统名称、关键文案和内嵌 Logo 断言仍通过，避免误把业务内容删除当成重设计。

### Task 2: 重建介绍页骨架与内容

**Files:**
- Modify: `public/introduction.html`

- [ ] **Step 1: 用品牌建筑感结构替换旧主体**

页面按以下语义顺序组织：

```html
<main data-brand-direction="architectural-c">
  <section class="brand-structure" id="overview"></section>
  <section class="business-friction" id="challenges"></section>
  <section class="control-chain" id="workflow"></section>
  <section class="product-evidence" id="evidence"></section>
  <section class="capability-ledger" id="capabilities"></section>
  <section class="management-outcomes" id="value"></section>
  <section class="closing-statement" id="contact"></section>
</main>
```

首屏使用“商机向前，风险判断也向前”作为业务主张，副文案直接说明销售访谈、规则预审、人工复核和项目跟踪，不使用“赋能、重塑、智能驱动”等空泛表述。

- [ ] **Step 2: 将业务问题改为事实对照**

用两行平面结构展示：

```html
<article>
  <span>01</span>
  <h3>信息收集成本高</h3>
  <p>字段多、口径细、信息分散，销售重复填写，复核人员仍需二次确认。</p>
</article>
<article>
  <span>02</span>
  <h3>后续项目跟踪效率低</h3>
  <p>有条件准入、回款、交付和销售承诺分散在线下记录，难以连续追踪。</p>
</article>
```

- [ ] **Step 3: 用连续业务链路替换卡片式流程**

保留六个真实步骤：销售访谈、信息提取、规则预审、人工复核、审批反馈、项目跟踪。每一步包含责任角色、输入和输出，不虚构统计数字。

- [ ] **Step 4: 将系统界面展示改为证据区**

以销售端和管理端两个不等宽窗口展示真实产品界面或高保真界面证据，窗口旁只说明实际功能：语音采集、结构化回填、风险证据、审批动作和连续跟踪。

### Task 3: 建立亚信品牌视觉系统

**Files:**
- Modify: `public/introduction.html`

- [ ] **Step 1: 定义品牌令牌**

使用以下内联 CSS 变量：

```css
:root {
  --brand-ink: oklch(25% 0.025 255);
  --brand-paper: oklch(97.8% 0.006 245);
  --brand-navy: oklch(27% 0.045 250);
  --brand-orange: oklch(68% 0.19 45);
  --brand-green: oklch(62% 0.16 150);
  --brand-silver: oklch(82% 0.01 245);
  --brand-line: oklch(87% 0.012 245);
}
```

- [ ] **Step 2: 构建局部深色建筑构图**

首屏用左右错位结构，深海军蓝仅用于主张承重面；右侧业务链路置于浅色网格。禁止整屏深色、光晕、玻璃拟态、渐变文字和悬浮卡片墙。

- [ ] **Step 3: 将 Logo 三色转化为业务结构**

橙色标识“信息进入”，绿色标识“判断与完成”，银色用于记录和结构线。圆环母题只出现在流程节点和局部裁切窗口，每个章节最多一次。

- [ ] **Step 4: 建立桌面汇报排版**

使用 12 栏网格、最大内容宽度 1280px、正文最大 72ch。标题采用系统中文字体栈和明确字重差，不加载网络字体，确保公司内网与离线环境稳定。

- [ ] **Step 5: 保留克制交互**

锚点滚动、页眉状态和章节轻微揭示使用 `opacity` 与 `transform`，并在 `prefers-reduced-motion: reduce` 下关闭动画。

### Task 4: 验证与收尾

**Files:**
- Verify: `public/introduction.html`
- Verify: `src/domain/preaudit/__tests__/introduction-page.test.ts`

- [ ] **Step 1: 运行目标测试**

Run:

```bash
npm test -- src/domain/preaudit/__tests__/introduction-page.test.ts
```

Expected: 1 test file passed。

- [ ] **Step 2: 运行静态检查**

Run:

```bash
npm run lint
```

Expected: exit code 0。

- [ ] **Step 3: 浏览器验证桌面长页**

在 1440 × 900 视口打开：

```text
http://localhost:3000/introduction.html
```

确认无横向溢出、所有内嵌图片加载成功、控制台无错误，并分别截图首屏、流程区和系统证据区。

- [ ] **Step 4: 检查单文件离线能力**

确认 Logo 与产品证据使用 `data:` URL 或内联 SVG，HTML 中不存在必须联网加载的字体、脚本和图片。

- [ ] **Step 5: 检查差异边界**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只报告本任务文件与用户原有未提交文件，不覆盖 `next.config.ts` 等既有改动。
