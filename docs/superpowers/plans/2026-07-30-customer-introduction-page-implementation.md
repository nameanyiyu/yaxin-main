# 亚信科技客户介绍页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作一个使用透明亚信科技 Logo、适合客户汇报的连续滚动 HTML 系统介绍页。

**Architecture:** 页面作为 `public/introduction.html` 独立静态文件交付，样式和轻量交互脚本内置；Logo 作为透明 PNG 独立资产。新增 Vitest 静态契约测试验证页面结构、文案、无障碍和资源引用，最后用真实浏览器验证桌面与移动端效果。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、PNG、Vitest、Next.js 静态资源服务。

---

### Task 1: 提取透明 Logo

**Files:**
- Create: `public/assets/introduction/asiainfo-logo.png`

- [ ] **Step 1: 检查源图**

确认源图尺寸为 1279×1706，Logo 位于画面中央黑色墙体区域，输出只保留彩色环形标志。

- [ ] **Step 2: 使用图片编辑模型提取**

使用源图片作为参考，要求：

```text
精确提取照片中央墙面上的彩色环形亚信科技 Logo。
移除墙面、大厅、花盆、反光和全部背景，输出透明背景 PNG。
保留 Logo 原始橙色、绿色、银灰色、黑色内圈、形状、比例和方向。
不要添加文字、阴影、发光、描边或重新设计。
画布紧贴 Logo，四周仅保留少量透明留白。
```

- [ ] **Step 3: 视觉检查**

使用图片查看工具确认背景透明、没有大厅残留、边缘完整、颜色自然。

- [ ] **Step 4: 提交**

```bash
git add public/assets/introduction/asiainfo-logo.png
git commit -m "feat: add transparent asiainfo logo asset"
```

### Task 2: 介绍页静态契约与 HTML 实现

**Files:**
- Create: `src/domain/preaudit/__tests__/introduction-page.test.ts`
- Create: `public/introduction.html`

- [ ] **Step 1: 写失败测试**

```ts
it('contains the approved presentation narrative and accessible structure', () => {
  expect(html).toContain('合同前置审批智能工作台');
  expect(html).toContain('销售语音访谈');
  expect(html).toContain('AI 信息提取');
  expect(html).toContain('项目跟踪');
  expect(html).toContain('数据分析');
  expect(html).toContain('prefers-reduced-motion');
  expect(html).toContain('assets/introduction/asiainfo-logo.png');
  expect(html).not.toContain('585829a1261a7be28b2826e76977fd9a.jpg');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/domain/preaudit/__tests__/introduction-page.test.ts`

Expected: FAIL，`public/introduction.html` 尚不存在。

- [ ] **Step 3: 实现长页**

页面必须包含：

```html
<header>品牌导航与汇报标签</header>
<main>
  <section id="hero">系统名称与核心价值</section>
  <section id="challenges">三项业务挑战</section>
  <section id="workflow">六步业务闭环</section>
  <section id="capabilities">五大产品能力</section>
  <section id="collaboration">销售端与管理端协作</section>
  <section id="value">五项业务价值</section>
  <section id="contact">汇报收束与系统入口</section>
</main>
```

实现响应式排版、清晰焦点、视口显现动画和 `prefers-reduced-motion` 降级。不得使用大厅照片、渐变文字、虚构业务指标或外部字体依赖。

- [ ] **Step 4: 运行静态测试**

Run: `npm test -- src/domain/preaudit/__tests__/introduction-page.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add public/introduction.html src/domain/preaudit/__tests__/introduction-page.test.ts
git commit -m "feat: add customer introduction page"
```

### Task 3: 完整验证与浏览器预览

**Files:**
- Modify only if verification exposes defects in Task 1 or Task 2 files.

- [ ] **Step 1: 运行完整检查**

Run: `npm test && npm run lint && npm run build`

Expected: 全部测试、ESLint 和 Next.js 生产构建通过。

- [ ] **Step 2: 启动项目**

Run: `npm run dev -- --hostname 0.0.0.0 --port 3000`

Expected: `/introduction.html` 和 `/admin` 返回 200。

- [ ] **Step 3: 桌面浏览器检查**

确认：

1. Logo 为透明背景且没有大厅画面；
2. 七个叙事区段顺序正确；
3. 导航锚点、系统入口和显现动画可用；
4. 页面无控制台错误和横向溢出。

- [ ] **Step 4: 移动端检查**

在 390×844 视口确认主标题、流程节点、双端协作和结尾操作正常换行，页面无横向溢出。

- [ ] **Step 5: 交付预览地址**

提供：

```text
http://localhost:3000/introduction.html
```
