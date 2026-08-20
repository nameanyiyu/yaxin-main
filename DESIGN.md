---
name: 亚信合同预审工作台
description: 面向内网销售与复核人员的固定模板合同预审界面
colors:
  ink: "oklch(25% 0.025 255)"
  muted-ink: "oklch(49% 0.025 255)"
  canvas: "oklch(98% 0.006 245)"
  surface: "oklch(99% 0.004 245)"
  line: "oklch(90% 0.012 245)"
  action: "oklch(52% 0.17 255)"
  action-soft: "oklch(95% 0.035 255)"
  danger: "oklch(52% 0.19 28)"
  warning: "oklch(65% 0.14 72)"
  success: "oklch(50% 0.11 155)"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  control: "8px"
  surface: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: 亚信合同预审工作台

## Overview

**Creative North Star: "审计工作台"**

界面像一张组织严密的审批桌面：项目状态在最前，风险证据紧随其后，字段与操作沿固定阅读路径展开。信息密度可以高，但层级必须稳定，用户无需猜测下一步在哪里。

系统拒绝通用 SaaS 营销页式的渐变、玻璃拟态和装饰性大卡片，也拒绝用动画或颜色掩盖状态含义。桌面端采用列表与详情并置，移动端按任务顺序纵向折叠。

**Key Characteristics:**

- 克制的冷灰画布与单一蓝色行动色
- 文本化状态和可追溯风险证据
- 平面分区、细边界、少量结构性阴影
- 150 至 200 毫秒的状态反馈，并尊重减少动态效果

## Colors

色彩承担行动和风险语义，不承担装饰。

### Primary

- **制度蓝**：只用于主操作、当前导航和键盘焦点。

### Neutral

- **墨色**：主要文本和高置信度结论。
- **雾灰画布**：页面背景，用轻微冷色降低长时间复核疲劳。
- **纸面白**：表单、列表和详情的工作表面。
- **结构线**：表格边界、分区和输入框轮廓。

### Named Rules

**The One Action Rule.** 每个视图只允许一个最强主操作，制度蓝不超过可见面积的 10%。

**The Text Before Color Rule.** 阻断、高风险、待补充和完成状态必须有文字，颜色只做第二信号。

## Typography

**Display Font:** 系统中文无衬线字体栈
**Body Font:** 系统中文无衬线字体栈

**Character:** 中性、清晰、在 macOS 与公司 Windows 终端上都可稳定渲染。数字和状态通过字重与对齐建立层级，不引入展示字体。

### Hierarchy

- **Headline**（700，24px，1.25）：页面任务标题。
- **Title**（600，16px，1.4）：分区标题和项目名称。
- **Body**（400，14px，1.6）：字段、风险解释和帮助文本，长说明限制在 72ch。
- **Label**（600，12px，1.4）：字段标签、状态和列表列名。

### Named Rules

**The Reading Order Rule.** 字号与字重只用于表达任务层级，禁止在数据区使用展示型大字。

## Elevation

默认平面化，通过画布、表面和 1px 结构线区分层级。阴影只在悬浮详情或移动端浮动导航出现，作用是说明层级变化，不用于装饰。

### Shadow Vocabulary

- **浮层低位**（`0 8px 24px oklch(25% 0.025 255 / 0.08)`）：移动端导航或需要覆盖列表的详情层。

### Named Rules

**The Flat By Default Rule.** 静止表面没有阴影，边界和留白负责组织内容。

## Components

### Buttons

- **Shape:** 紧凑圆角（8px），最小高度 40px。
- **Primary:** 制度蓝底、纸面白文字，水平内边距 16px。
- **Hover / Focus:** 150ms 色阶变化；焦点使用 2px 外环，不移动布局。
- **Secondary / Ghost:** 结构线边框或透明底，仅用于次要操作。

### Chips

- **Style:** 状态文字配浅色背景和 1px 边界，风险等级使用语义色但保持低饱和。
- **State:** 筛选选中时同时改变背景、边界和字重。

### Cards / Containers

- **Corner Style:** 工作表面圆角（12px）。
- **Background:** 纸面白置于雾灰画布。
- **Shadow Strategy:** 默认无阴影。
- **Border:** 1px 结构线。
- **Internal Padding:** 16px 至 24px，依信息密度调整，不做嵌套卡片。

### Inputs / Fields

- **Style:** 纸面白背景、1px 结构线、8px 圆角。
- **Focus:** 制度蓝边界和 2px 淡色外环。
- **Error / Disabled:** 错误同时显示文字；禁用态降低对比但保持可读。

### Navigation

桌面端使用固定侧栏，当前项以浅蓝表面和高对比文字表达；移动端使用底部任务导航。导航不使用渐变、不脉冲。

### Risk Finding

风险项以“等级、结论、命中原因、证据、建议”的固定顺序呈现。阻断项必须最先出现，待补充项提供可执行的缺失字段说明。

## Do's and Don'ts

### Do:

- **Do** 把项目状态、缺失数量和命中风险放在页面首屏。
- **Do** 使用文字、图标和颜色共同表达风险等级。
- **Do** 为加载、空列表、接口失败、禁用和保存中状态提供明确反馈。
- **Do** 让列表、详情、按钮和输入在桌面与移动端保持同一交互词汇。

### Don't:

- **Don't** 使用通用 SaaS 营销页式的渐变、玻璃拟态和装饰性大卡片。
- **Don't** 使用 Mock 记录、虚构审批成功或伪造外部流程编号。
- **Don't** 仅用颜色表达高风险，或使用干扰复核工作的装饰动画。
- **Don't** 把全部信息压进同尺寸卡片网格。
- **Don't** 使用大于 1px 的彩色侧边条、渐变文字或自定义滚动条制造风格。
