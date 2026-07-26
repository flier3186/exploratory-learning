# 探索式 AI 学习工具

用追问，把答案变成知识树。一个纯前端 PWA 应用，通过 AI 生成结构化学习卡片、推荐追问、理解检测和间隔复习，帮助用户真正弄懂问题。

线上地址：https://exploratory-learning.pages.dev/

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 测试 | Vitest 4 + React Testing Library + jsdom |
| 持久化 | localStorage（无后端） |
| PWA | Service Worker + Web App Manifest |
| 部署 | Cloudflare Pages（GitHub Actions 自动部署） |
| AI | 用户自配 API Key 直连大模型（默认 DeepSeek，支持智谱/通义千问/Groq） |

运行时仅依赖 React 和 React-DOM，无 UI 库、无状态管理库、无路由库。Markdown 渲染和知识图谱布局均为自研。

## 目录结构

```
project/
├── .github/workflows/
│   └── deploy.yml                      # Cloudflare Pages 自动部署工作流
├── public/
│   ├── templates/                       # 内置知识模板
│   │   ├── critical-thinking.json
│   │   ├── learning-methods.json
│   │   └── prompt-thinking.json
│   ├── app-icon.svg                     # PWA 应用图标
│   ├── favicon.svg
│   ├── manifest.webmanifest             # PWA 清单
│   └── sw.js                            # Service Worker（离线缓存 v24）
├── src/
│   ├── components/                      # UI 组件层
│   │   ├── ErrorBoundary.tsx            # 错误边界 + 降级 UI
│   │   ├── FeynmanModal.tsx             # 费曼检验弹窗（含语音输入）
│   │   ├── GrowthTimelineModal.tsx      # 成长时间线
│   │   ├── KnowledgeGraphModal.tsx      # 知识图谱可视化（拖拽/编辑/聚焦）
│   │   ├── LearningCard.tsx             # 核心学习卡片
│   │   ├── LearningCard.test.tsx        # 组件测试
│   │   ├── LearningPathModal.tsx        # 学习路径推荐
│   │   ├── MarkdownText.tsx             # 轻量 Markdown 渲染
│   │   ├── MarkdownText.test.tsx        # 组件测试
│   │   ├── NodeTree.tsx                 # 侧边栏知识树
│   │   ├── Onboarding.tsx               # 新手引导
│   │   ├── QuizModal.tsx                # 闪测弹窗
│   │   ├── ReviewModal.tsx              # 复习弹窗
│   │   ├── SearchModal.tsx              # 知识搜索
│   │   ├── SettingsModal.tsx            # 设置弹窗
│   │   ├── StatsModal.tsx               # 学习统计（效率趋势/留存率/复习率）
│   │   ├── TemplateMarket.tsx           # 模板市场
│   │   └── WeeklyReportModal.tsx        # 周报弹窗
│   ├── graph/                           # 知识图谱布局（纯函数）
│   │   ├── colors.ts                    # 掌握度/角色/连线配色
│   │   ├── edges.ts                     # SVG 连线路径计算
│   │   └── layout.ts                    # Sugiyama 分层布局算法
│   ├── hooks/                           # React 业务逻辑
│   │   ├── useAppState.ts               # 顶层状态中枢
│   │   ├── useGeneration.ts             # AI 卡片生成
│   │   ├── useVoiceInput.ts             # 语音输入（press-to-talk + 振动反馈）
│   │   ├── useFeynman.ts                # 费曼检验
│   │   ├── useQuiz.ts                   # 闪测会话
│   │   ├── use-node-actions.ts          # 节点操作
│   │   ├── use-search.ts                # 搜索
│   │   ├── use-review.ts                # 复习筛选
│   │   ├── use-import-export.ts         # 导入导出
│   │   ├── use-knowledge-graph.ts       # 图谱数据计算
│   │   ├── use-learning-path.ts         # 学习路径推荐
│   │   ├── use-streak.ts                # 连续学习统计
│   │   └── use-weekly-report.ts         # 周报数据聚合
│   ├── test/
│   │   └── setup.ts                     # 测试环境初始化
│   ├── utils/
│   │   └── anki-export.ts               # Anki 导出工具
│   ├── ai.ts                            # AI Prompt 构建 + 模型调用 + JSON 校验
│   ├── app-helpers.ts                   # Payload 转节点 + 上下文构建
│   ├── constants.ts                     # 全局常量 + 初始状态
│   ├── learning-profile.ts              # 学习画像自动计算
│   ├── learning.ts                      # 搜索评分 + 复习排序
│   ├── main.tsx                         # 应用入口 + SW 注册
│   ├── quiz-generator.ts                # 闪测/费曼题目生成
│   ├── spaced-repetition.ts             # SM-2 间隔复习算法
│   ├── storage.ts                       # localStorage 持久化
│   ├── types.ts                         # 全局类型定义
│   ├── utils.ts                         # 通用工具函数（含 URL-safe base64 分享链接）
│   └── styles*.css                      # 10 个分模块样式文件
├── check_actions.py                     # GitHub Actions 状态检查脚本
├── push.py                              # GitHub 推送辅助脚本（API 方式）
├── index.html                           # HTML 入口
├── package.json
├── tsconfig.json
├── vite.config.ts
├── netlify.toml                         # Netlify 部署配置
└── vercel.json                          # Vercel 部署配置
```

## 核心模块

### 数据模型

`types.ts` 定义了项目的全部类型系统。核心数据结构：

| 类型 | 说明 |
|------|------|
| `LearningNode` | 学习节点，包含问题、答案、追问、检测题、掌握度、SRS 字段、知识图谱连接 |
| `AppState` | 应用状态，包含主题、节点字典、选中项、API 配置、用户偏好 |
| `LearningProfile` | 学习画像，由行为数据自动生成，包含领域能力、认知风格、节奏、盲区 |
| `PathStep` | 学习路径推荐步骤，按复习/盲区/巩固/探索分类 |
| `GraphLayoutNode` | 图谱节点布局坐标，由 Sugiyama 算法计算 |

### 业务逻辑层

| 模块 | 职责 |
|------|------|
| `ai.ts` | 构建 Prompt（含学习画像注入）、调用大模型、解析 JSON、校验结构、修复字段、事实风险评估 |
| `learning.ts` | 节点路径计算、搜索评分、复习候选筛选与优先级排序 |
| `storage.ts` | localStorage 读写、导入节点/状态/模板的归一化与旧数据兼容 |
| `learning-profile.ts` | 从用户行为（答题通过率、追问偏好、学习节奏）自动计算学习画像，生成 Prompt 注入摘要 |
| `spaced-repetition.ts` | SM-2 算法实现：间隔/难度因子更新、到期判定、复习时间标签 |
| `quiz-generator.ts` | 从理解检测题生成闪测题、构建闪测会话、费曼检验 Prompt |
| `app-helpers.ts` | Followup 类型转角色、Payload 净化、兜底数据、Payload 转 LearningNode |
| `graph/layout.ts` | Sugiyama 分层布局：分层分配、坐标计算、交叉减少、视口计算 |
| `graph/edges.ts` | SVG 连线路径构建，区分 child/related/prerequisite 三种关系 |
| `graph/colors.ts` | 掌握度配色、角色配色、连线样式 |

### Hooks 层

`useAppState.ts` 是顶层状态中枢，加载并自动持久化 state，聚合所有子 hook。其余 hook 各管一个垂直功能：

- `useGeneration` — AI 卡片生成，管理生成步骤进度和失败重试
- `useQuiz` — 闪测会话全流程，结束后更新 SRS
- `useFeynman` — 费曼检验，提交讲解后 AI 评分
- `useVoiceInput` — 浏览器原生 SpeechRecognition 封装（press-to-talk + 振动反馈 + Android 超时降级）
- `use-node-actions` — 选中/删除/星标/置信度/检测状态/SRS 重置
- `use-knowledge-graph` — 图谱数据计算与可见性过滤
- `use-learning-path` — 路径推荐（复习到期/知识盲区/角色不平衡/未访问分支）
- `use-streak` — 84 天热力图 + 7 天 SRS 周视图
- `use-weekly-report` — 周报数据聚合

### 组件层

`App.tsx` 编排全部 hooks 与弹窗，管理 UI 状态与渐进式功能解锁（首次创建节点后解锁复习按钮，第三次创建后解锁路径/图谱/统计）。14 个弹窗和卡片组件各自独立，通过 props 接收数据和回调。

### 样式架构

采用 CSS 变量主题系统，主色系为孔雀绿（`#0d9488`）+ 玉子黄（`#f59e0b`），定义在 `styles.css` 的 `:root` 中。10 个分模块样式文件按功能拆分：

| 文件 | 范围 |
|------|------|
| `styles.css` | 全局变量、基础样式、动画 |
| `styles-workspace.css` | 主工作区、浮动按钮 |
| `styles-sidebar.css` | 侧边栏、知识树 |
| `styles-modal.css` | 弹窗、设置、模板市场 |
| `styles-graph.css` | 知识图谱 |
| `styles-markdown.css` | Markdown 渲染 |
| `styles-roles.css` | 角色标签配色 |
| `styles-quiz.css` | 闪测弹窗 |
| `styles-checks.css` | 理解检测 |
| `styles-followup.css` | 追问推荐 |

## 本地开发

```bash
npm install
npm run dev
```

打开终端输出的本地地址即可使用。首次使用需在「设置」中填入 API Key。

### 命令清单

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | `tsc && vite build`，类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm test` | `vitest run`，单次运行全部测试 |
| `npm run test:watch` | `vitest`，监听模式 |

### 测试

262 个测试覆盖 11 个文件，包括核心业务逻辑（AI 调用、存储、学习画像、间隔复习、搜索评分、闪测生成、配置分享）和组件级测试（LearningCard、MarkdownText）。

```bash
npm test
```

## 部署

### Cloudflare Pages（当前主部署）

项目通过 GitHub Actions 自动部署到 Cloudflare Pages。每次推送到 `main` 分支，workflow 会自动构建并部署。

线上地址：https://exploratory-learning.pages.dev/

#### 所需 Secrets

在仓库 Settings → Secrets and variables → Actions 中配置：

| Secret 名称 | 值 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | 需 Account Settings: Read + Cloudflare Pages: Edit 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | `2d0298af6670ed1db414cd0b646d70c5` | Cloudflare 账户 ID |

#### 推送代码

由于本地网络环境下 `git push` 直连 GitHub 可能超时，项目附带 `push.py` 脚本通过 GitHub API 推送：

```bash
# 推送已修改的文件
python push.py "修复了某某问题"

# 推送所有文件（全量同步）
python push.py "全量同步" --all
```

脚本会自动从 git credential 读取认证信息，逐文件通过 API 上传，推送后自动同步本地 git 状态。每次 push 会触发 GitHub Actions 自动构建部署。

#### 检查部署状态

```bash
python check_actions.py
```

#### 手动触发部署

也可以在 GitHub 仓库的 Actions 页面手动触发 workflow（`workflow_dispatch`）。

### 其他平台

项目同时包含 `netlify.toml` 和 `vercel.json`，可直接导入部署到 Netlify 或 Vercel，无需额外配置。

## 数据存储

所有数据存储在浏览器 localStorage，key 为 `exploratory-learning-v31-state`，无后端、无云同步。

- 学习数据：在「设置」中导出 JSON 备份，可在其他设备导入
- API Key：不写入备份文件，需在每个设备单独配置
- 安全提醒：部署到公网后，不要在他人设备上填写自己的 API Key

## API 配置

进入应用「设置」页面，选择 AI 服务商并填入 API Key。支持以下预设：

| 服务商 | API 地址 | 默认模型 |
|--------|---------|---------|
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| 智谱 AI | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-turbo` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` |

API Key 只保存在浏览器本地，不会被导出到 JSON 备份。配置可通过分享链接（URL-safe base64 编码，URL Hash 传递）传递给其他设备，打开链接后自动填充。

## PWA

应用已配置 Service Worker（版本 v24），支持离线访问已缓存内容：

- Shell 资源（HTML/manifest/图标）安装时缓存
- JS/CSS 构建产物走 stale-while-revalidate，带版本检查（`x-sw-cache-version` header）
- 导航请求网络优先，失败回退缓存首页
- API 调用不缓存，离线时返回 503

## 维护指南

### 部署铁律（不得跳过）

部署完成的唯一定义：改动已推送到远程仓库 + CI/CD 构建成功 + 线上资源已更新。完整流程：

```
改代码 → git add → git commit → git push（或 python push.py）→ CI 成功 → 线上验证
```

**每次部署后必须验证**：

1. `git log --oneline -5` 确认最新 commit 包含本次改动
2. `git status` 确认工作区干净
3. `python check_actions.py` 确认 CI conclusion: success
4. 用 Python requests HTTP GET 线上 CSS/JS/SW 文件，验证实际内容
5. 报告时附上具体输出作为证据

详细规则见 `F:\traework\00_全局工作台\00_全局执行规则.md` 第 16-22 条。

### 修改代码后部署

1. 本地修改代码
2. 运行 `npm test` 确认测试通过
3. 运行 `npm run build` 确认构建通过
4. `git add` → `git commit` → `git push`（或 `python push.py "提交说明"`）
5. `python check_actions.py` 确认 GitHub Actions 部署成功
6. HTTP 验证线上资源已更新
7. 递增 SW 版本号

### SW 版本号管理

每次部署必须递增 `public/sw.js` 中的 `CACHE_NAME` 和 `CACHE_VERSION`，否则用户浏览器不会刷新缓存。当前版本：v24。

### 新增功能时的注意事项

- 新增的纯函数模块放在 `src/` 下，配套写 `*.test.ts`
- 新增的 React 组件放在 `src/components/`，复杂组件配套写 `*.test.tsx`
- 新增的业务 hook 放在 `src/hooks/`，在 `useAppState.ts` 中聚合
- 类型定义统一放 `src/types.ts`
- Service Worker 版本号在 `public/sw.js` 的 `CACHE_NAME` 和 `CACHE_VERSION` 中维护，发布时需递增

### 配置文件位置

| 配置 | 文件 |
|------|------|
| Vite 构建 | `vite.config.ts` |
| TypeScript | `tsconfig.json` |
| Cloudflare 部署 | `.github/workflows/deploy.yml` |
| Netlify 部署 | `netlify.toml` |
| Vercel 部署 | `vercel.json` |
| PWA 清单 | `public/manifest.webmanifest` |
| Service Worker | `public/sw.js` |
| 全局规则 | `F:\traework\00_全局工作台\00_全局执行规则.md` |
| 项目规则 | `F:\traework\01-exploratory-learning-app\00_项目规则.md` |
| 复利日志 | `F:\traework\00_全局工作台\01_全局复利日志.md` |

### 项目文档位置

| 文档 | 位置 |
|------|------|
| 项目说明 | `F:\traework\01-exploratory-learning-app\01_项目说明.md` |
| 项目规则 | `F:\traework\01-exploratory-learning-app\00_项目规则.md` |
| 开发日志 | `F:\traework\01-exploratory-learning-app\03_开发日志.md` |
| 项目进度 | `F:\traework\01-exploratory-learning-app\PROGRESS.md` |
| 手工测试 | `project/TESTING.md` |
