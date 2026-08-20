# 伙伴端环境搭建指南

如果你是第一次接入这个项目，按以下步骤操作。

---

## 第一步：安装必要工具

### 1. 安装 Git

下载地址：https://git-scm.com/download/win

安装时一路默认即可。安装完成后打开 PowerShell，输入：

```bash
git --version
```

看到版本号说明安装成功。

### 2. 安装 Node.js 20+

下载地址：https://nodejs.org/

选择 LTS 版本（20.x 或更高）。安装时勾选 "Add to PATH"。

验证：

```bash
node --version
```

### 3. 安装 pnpm

```bash
npm install -g pnpm
pnpm --version
```

### 4. 配置 Git 身份（只需一次）

```bash
git config --global user.name "你的姓名"
git config --global user.email "你的邮箱@example.com"
```

---

## 第二步：克隆仓库

```bash
# 找一个你放代码的目录，比如 D:\aiwork
cd D:\aiwork

# 克隆仓库（甲方会给你仓库地址）
git clone https://github.com/对方用户名/yaxin-preaudit.git

# 进入项目目录
cd yaxin-preaudit

# 安装依赖
pnpm install --frozen-lockfile
```

---

## 第三步：配置环境变量

在项目根目录创建 `.env.local` 文件（这个文件不会被提交到 Git）：

```env
# OpenAI 兼容 LLM
LLM_API_BASE_URL=https://your-internal-llm.example.com/v1
LLM_API_KEY=replace-me
LLM_MODEL=replace-me

# 项目状态目录
PREAUDIT_DATA_DIR=./data/state

# 后台 API 的 HTTP Basic Auth
PREAUDIT_ADMIN_USER=reviewer
PREAUDIT_ADMIN_PASSWORD=replace-with-a-long-random-password

# 语音转写
TRANSCRIPTION_API_KEY=replace-me
TRANSCRIPTION_API_BASE_URL=https://api.siliconflow.cn/v1
TRANSCRIPTION_MODEL=FunAudioLLM/SenseVoiceSmall
TRANSCRIPTION_FALLBACK_MODEL=TeleAI/TeleSpeechASR
TRANSCRIPTION_LANGUAGE=zh-CN
TRANSCRIPTION_NORMALIZE_AUDIO=true
```

向甲方要真实的 API Key 和配置值。

---

## 第四步：验证项目能跑

```bash
# 运行测试
pnpm test

# 代码检查
pnpm lint

# 构建验证
pnpm build

# 启动开发服务器
pnpm dev
```

浏览器打开 http://localhost:3000/admin，能看到管理端界面说明环境就绪。

---

## 第五步：开始工作

阅读 `COLLABORATION.md` 文件了解协作流程和模块分工。

日常流程：

```bash
# 每次开始前
git checkout main
git pull origin main
git checkout -b your-task-name

# 改代码...

# 提交
git add -A
git commit -m "描述你改了什么"
git push -U origin your-task-name
```

然后去 GitHub 网页合并 Pull Request。

---

## 常见问题

### Q: pnpm install 报错怎么办？

A: 检查 Node.js 版本是否 20+，检查 pnpm 版本是否 10+。如果 lockfile 冲突，删掉 node_modules 重新安装：

```bash
Remove-Item -Recurse -Force node_modules
pnpm install
```

### Q: git push 提示没有权限？

A: 确认甲方已经在 GitHub 仓库设置里把你加为 Collaborator。Settings → Collaborators → Add people。

### Q: git pull 报错 "unrelated histories"？

A: 你的本地 main 和远程 main 不一致。用这个命令：

```bash
git pull origin main --allow-unrelated-histories
```

### Q: 修改后怎么测试？

A: 先跑 `pnpm test`，再跑 `pnpm lint`。都通过后才能提交 PR。

### Q: 我改了文件但不知道怎么提交？

A: 看 COLLABORATION.md 的 "快速参考卡" 部分，照着复制粘贴。
