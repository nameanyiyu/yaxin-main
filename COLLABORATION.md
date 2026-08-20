# 两人并行协作指南

本文件是本项目双人协作的权威流程参考。任何人开始修改代码前，请先读完本文件。

---

## 一、项目背景

- 本项目是亚信域外合同前置审批系统（Next.js 16 + React 19 + AI SDK 7）
- 两人协作，Git 熟练度较低，需要极简流程避免冲突
- 代码已托管在 GitHub 私有仓库

---

## 二、模块边界（最重要的规则）

按物理目录划分，两人各自负责一块，几乎不会碰到同一文件。

### 甲方：API 路由层 + HTTP 边界

| 模块 | 路径 | 说明 |
|------|------|------|
| 销售端 API | `src/app/api/s/[token]/*` | chat/start/workflow/prepare-review/transcribe/qa |
| 管理端 API | `src/app/api/admin/*` | projects/tracking/templates/risk-config 等 |
| HTTP 响应 | `src/domain/preaudit/http.ts` | 统一错误响应和 JSON 响应 |
| 鉴权中间件 | `src/proxy.ts` | admin 路径的 Basic Auth + session |

**甲方只触碰 `src/app/api/` 下的文件和 `http.ts` / `proxy.ts`。**

### 乙方：域核心 + 前端

| 模块 | 路径 | 说明 |
|------|------|------|
| 领域逻辑 | `src/domain/preaudit/*`（除 http.ts） | agent/interview/risk-engine/service/repository 等 |
| 前端组件 | `src/components/*` | admin 和 sales 面板 |
| 前端页面 | `src/app/s/*` `src/app/admin/*` `src/app/login/*` | 页面入口（非 api 目录） |
| 基础设施 | `src/lib/*` | llm/transcription/feishu/store 等 |
| 配置 | `src/config/index.ts` | 应用配置 |

### 共享但低频的文件

双方都可能改，频率低，约定谁改谁在 PR 描述里注明：

- `src/types/index.ts`（类型定义）
- `src/domain/preaudit/types.ts`（域类型）
- `package.json`（依赖增减）
- `README.md` / `DESIGN.md` / `PRODUCT.md`
- `next.config.ts`

---

## 三、日常协作流程（极简版）

**核心规则：开始干活前先拉代码，干完一段就提交推送。**

### 1. 开始工作前

```bash
# 每次开始前，先切回 main 并拉最新
git checkout main
git pull origin main

# 创建你自己的工作分支（分支名用英文，描述任务）
git checkout -b api-add-export-endpoint
```

### 2. 改代码

正常修改文件。改完一批后提交。

### 3. 提交并推送

```bash
# 查看改了哪些文件
git status

# 全部暂存
git add -A

# 提交，消息用中文描述改了什么
git commit -m "API: 新增项目导出端点支持 markdown 格式"

# 推送到远程（第一次推送用 -U）
git push -U origin api-add-export-endpoint
```

### 4. 合并到 main

去 GitHub 网页（仓库页面），会看到你的分支有 "Compare & pull request" 按钮：

1. 点击 **Compare & pull request**
2. 标题写清楚改了什么
3. 点 **Create pull request**
4. 点 **Merge pull request** → **Confirm merge**
5. 合并后删除分支（点 **Delete branch**）

### 5. 合并后回到本地

```bash
git checkout main
git pull origin main

# 删除本地的旧分支（已合并的可以安全删除）
git branch -d api-add-export-endpoint
```

---

## 四、冲突处理

如果 GitHub 提示 "Can't automatically merge" 或有冲突，不要慌。

### 方法一：在 GitHub 网页上解决（简单冲突）

GitHub 的 pull request 页面如果冲突不复杂，会提供网页编辑器，直接在网页上改好再合并。

### 方法二：本地解决（复杂冲突）

```bash
# 确保在你的工作分支上
git checkout api-add-export-endpoint

# 拉最新的 main 到本地
git fetch origin
git merge origin/main
```

如果报冲突，Git 会告诉你哪些文件冲突。打开冲突文件，搜索 `<<<<<<<` 标记：

```
<<<<<<< HEAD
你的改动内容
=======
main 上的改动内容
>>>>>>> origin/main
```

手动选择保留哪部分（或两部分都保留），删掉 `<<<<<<<`、`=======`、`>>>>>>>` 三行标记后保存。

然后：

```bash
git add -A
git commit -m "解决与 main 的冲突"
git push origin api-add-export-endpoint
```

回 GitHub 网页，冲突消失后就能 Merge 了。

---

## 五、API 改造的三种场景

### 场景 A：新加一个 API 路由（不碰域层）

- 只在 `src/app/api/` 下新建文件
- 调用现有 PreauditService 的方法
- 乙方完全不受影响

### 场景 B：改现有 API 路由的请求/响应格式

- 只改 `src/app/api/` 下的 route.ts
- 如果需要改错误码映射，改 http.ts
- 在 PR 描述里说明改了哪些错误码

### 场景 C：API 需要新的域层能力

- 你在 API 层调现有 service 方法，发现缺功能
- **不要自己去改域层文件**（那是乙方的领地）
- 在 GitHub 仓库建一个 Issue，描述需要域层加什么方法、什么参数
- 乙方实现后你 pull 下来就能用了
- 如果等不了，在自己的 API 分支里临时写个 helper 函数，PR 描述里注明 "临时 helper，待迁移到域层"

---

## 六、防冲突的工程约定

1. **`.env.local` 不提交**（已在 .gitignore 里），各自维护本地环境变量
2. **`/data/state/` 不提交**（已在 .gitignore 里），项目运行数据各自独立
3. **`package.json` 改动要沟通**：谁加依赖谁在 PR 标题加 [deps] 前缀，合并后另一人要重新 pnpm install
4. **每天结束前 push**：哪怕没改完也 push 到自己的分支，让对方看到进展
5. **commit 消息用中文描述改了什么**

---

## 七、合并前必须通过

```bash
pnpm lint
pnpm test
pnpm build
```

如果分支上跑不通，先别合并。修好测试再合并。

测试文件在 `src/domain/preaudit/__tests__/` 下。如果 API 改动影响了测试，更新测试再合并。

---

## 八、如果有人改了共享文件

types.ts、package.json、README.md 等共享文件双方都可能改：

1. 谁改谁在 PR 描述里注明 "改了 XXX 文件"
2. 另一人 pull 下来后注意看有没有影响自己的模块
3. 如果两边同时改了同一文件，按第四节冲突处理

---

## 九、应急情况

### 我改坏了 main 怎么办？

```bash
# 查看提交历史
git log --oneline -10

# 回退到上一个版本（保留改动在工作区）
git reset --soft HEAD~1

# 完全丢弃最近一次提交（谨慎！确认前不要用）
git reset --hard HEAD~1
```

### 我不小心把不该提交的文件提交了？

```bash
# 从 Git 里移除但保留本地文件
git rm --cached 文件名
git commit -m "移除误提交的文件"
```

### 我想看对方改了什么？

```bash
git fetch origin
git log origin/main --oneline -10
git diff main origin/main
```

---

## 十、分支命名约定

用英文，用短横线分隔，描述任务内容：

- `api-add-export-endpoint`（新增导出端点）
- `api-fix-auth-headers`（修复鉴权头）
- `domain-risk-engine-refactor`（风险引擎重构）
- `frontend-admin-panel-update`（管理端面板更新）

---

## 十一、快速参考卡

```bash
# === 日常 ===
git checkout main                    # 切回主分支
git pull origin main                 # 拉最新
git checkout -b my-task              # 创建工作分支
git add -A                           # 暂存所有改动
git commit -m "描述改了什么"            # 提交
git push -U origin my-task           # 推送

# === 合并后 ===
git checkout main
git pull origin main
git branch -d my-task

# === 冲突 ===
git fetch origin
git merge origin/main
# 手动解决冲突后：
git add -A
git commit -m "解决冲突"
git push origin my-task

# === 查看 ===
git status                           # 看当前状态
git log --oneline -10                # 看提交历史
git diff                             # 看未提交的改动
```
