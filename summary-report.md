# DSOJ 项目全面审查总结报告

> 生成时间：2026-07-15 · 模式：深度模式 · 格式：Markdown
> 审查范围：Next.js 16 (App Router) + 自定义 Express 服务器（server.ts）+ Prisma + MongoDB + Socket.IO + OpenAI/Anthropic/DeepSeek AI 集成 的全栈在线评测（OJ）平台

---

## 📊 健康度总览

| 维度                   | 分数         | 评级        | 说明                                                         |
| ---------------------- | ------------ | ----------- | ------------------------------------------------------------ |
| 安全（Security）       | **55 / 100** | 🟠 风险偏高 | JWT 默认密钥回退、admin AI 路由可被任意角色命中、未全局 CSRF |
| 稳定性（Stability）    | **68 / 100** | 🟡 中等     | 评测隔离基本到位，但 child_process 命令注入风险存在          |
| 质量（Quality）        | **70 / 100** | 🟡 中等     | API 响应/错误体系一致；存在 console.error 散落与冗余 log     |
| 完整性（Completeness） | **82 / 100** | 🟢 较好     | 模块覆盖全（auth/contest/training/class/AI/admin）           |
| **综合**               | **69 / 100** | 🟡 中等     | 可上线，但需在 4 处关键问题上修复后再开放公网                |

**关键统计**：API 路由 **96** 个 · Prisma 模型 **约 30** · 管理员页面 **15** · 前端页面 **80+** · 鉴权中间件 **1**（`middleware.ts`）· 评测模块 **2**（executor / compiler）· AI 服务商 **≥ 5**（OpenAI / Anthropic / DeepSeek / 国产其它）

---

## 1️⃣ 功能表与文件列表

### 1.1 模块清单

| 模块                          | 主要能力                                                       | 入口路由                                                                           | 核心文件                                           |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| 认证                          | 登录 / 注册 / 找回密码 / 当前用户 / 登出                       | `/api/auth/*`                                                                      | `lib/auth/service.ts`, `lib/auth/index.ts`         |
| 用户                          | 资料 / 偏好 / 头像分片上传 / 公开信息 / 统计                   | `/api/users/*`                                                                     | `lib/user/service.ts`                              |
| 题目                          | 列表 / 详情 / 标签 / 状态 / 提交记录                           | `/api/problems/*`                                                                  | `lib/problem/*`, `prisma/schema.prisma`            |
| 提交 / 评测                   | 提交代码 / 拉取状态 / 评测队列                                 | `/api/submissions/*`, `/api/judge/*`(推断)                                         | `lib/judge/executor.ts`, `lib/judge/compiler.ts`   |
| 题解                          | 题解 CRUD / 点赞 / 权限校验                                    | `/api/solutions/*`                                                                 | `lib/solution/*`（推断）                           |
| 竞赛                          | CRUD / 注册 / 题目 / 排行榜                                    | `/api/contests/*`                                                                  | `lib/contest/service.ts`                           |
| 训练                          | CRUD / 题目列表 / 加入                                         | `/api/trainings/*`                                                                 | `lib/training/*`                                   |
| 班级                          | CRUD / 成员 / 作业 / 笔记 / 邀请                               | `/api/classes/*`                                                                   | `lib/class/*`（推断）                              |
| 排行榜 / 仪表盘 / 通知 / 公告 | 全站聚合                                                       | `/api/rankings`, `/api/home/dashboard`, `/api/notifications`, `/api/announcements` | `lib/{rank,dashboard,notification,announcement}/*` |
| AI                            | 提供商 / 模型 / 题解生成（队列）                               | `/api/ai/*`, `/api/admin/ai/*`                                                     | `lib/ai/*`（15 个文件）                            |
| 管理员                        | 用户 / 题库 / 评测 / 训练 / 班级 / 公告 / 设置 / 仪表盘 / 日志 | `/api/admin/**`                                                                    | `app/admin/**` (15 个页面)                         |

### 1.2 数据库表（Prisma 模型）

> 来源：`prisma/schema.prisma`

| #   | 模型                                                      | 用途          | 关键字段                                           |
| --- | --------------------------------------------------------- | ------------- | -------------------------------------------------- |
| 1   | `User`                                                    | 用户          | `id, username, email, password, role, aiStatus...` |
| 2   | `UserProfile` / `UserPreference`                          | 资料 / 偏好   | （推断）                                           |
| 3   | `Problem`                                                 | 题目          | `id, aiStatus, ...`                                |
| 4   | `TestCase`                                                | 测试点        | `id, problemId, input, output, score`              |
| 5   | `Submission`                                              | 提交          | `id, status, code, ...`                            |
| 6   | `Contest` / `ContestProblem` / `ContestParticipant`       | 竞赛          | `id, startTime, endTime, ...`                      |
| 7   | `Training` / `TrainingProblem`                            | 训练          | （推断）                                           |
| 8   | `Class` / `ClassMember` / `ClassAssignment` / `ClassNote` | 班级          | （推断）                                           |
| 9   | `Solution` / `SolutionLike`                               | 题解          | （推断）                                           |
| 10  | `Notification` / `Announcement`                           | 通知公告      | （推断）                                           |
| 11  | `Ranking` / `Dashboard` 派生                              | 排行榜        | （推断）                                           |
| 12  | `AiProvider` / `AiModel` / `AiSolution` / `AiUsageLog`    | AI 配置与生成 | （推断）                                           |
| 13  | `Setting`                                                 | 全站设置      | （推断）                                           |
| 14  | `Source` / `SourceChangeLog`                              | 题源          | （推断）                                           |
| 15  | `Tag` / `ProblemTag`                                      | 题目标签      | （推断）                                           |
| 16  | `EmailVerification` / `PasswordReset`                     | 验证          | （推断）                                           |

### 1.3 前端文件列表（按模块）

```
app/(public)        - 主页、问题列表、详情、题解、排行榜、训练列表、班级列表
app/(auth)          - 登录 / 注册 / 忘记密码
app/(user)          - 资料 / 设置 / 通知 / 我的提交
app/contests        - 竞赛详情 / 排行榜 / 注册
app/classes         - 班级详情 / 作业 / 笔记 / 成员
app/admin/*         - 15 个管理子页面（含 ai-generation / ai-models）
components/*        - 业务组件（含 MarkdownContent.tsx 等）
lib/*               - 业务工具与领域服务
```

### 1.4 后端 API 端点（按角色分类，共 96 个）

- **公开（public）** 21：`/api/problems`, `/api/problems/tags`, `/api/problems/status`, `/api/rankings`, `/api/announcements`, `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/settings/public`, `/api/solutions/check-permission`, `/api/ai/models`, `/api/ai/providers-presets`, `/api/users/[id]/info`, `/api/users/[id]/stats`, `/api/health/db`, `/api/home/dashboard`, 等
- **已登录（withApi）** 35+：用户资料、提交、题解、班级、训练、竞赛、通知等
- **管理员（withApi.admin）** 30+：`/api/admin/**`（含 AI 提供商 / 模型 / 题解状态）

---

## 2️⃣ 漏洞与冗余审查

### 🔴 严重（Critical）

#### C-1 JWT 密钥存在硬编码回退

- **位置**：`lib/auth/index.ts`（`secret = process.env.JWT_SECRET || 'oj-platform-default-secret'`）
- **影响**：若部署时未设置 `JWT_SECRET`，将使用公开的默认密钥签发 token，攻击者可伪造任意身份（包括管理员）。
- **修复**：启动时强制读取；缺失则 `throw` 阻止启动。

#### C-2 AI 模型管理路由可被任意角色访问

- **位置**：`app/api/admin/ai/models/route.ts` 内的 `withApi` 包装与同目录 `app/api/ai/models/route.ts` 边界模糊；从审计结果看，`providers-presets` 与 `models` 公开，但 `admin/ai/models` 应受管理员限制。
- **影响**：低权限用户或匿名用户可能触发 `PUT/DELETE` 行为（取决于服务层是否再次校验）。
- **修复**：所有 `/api/admin/ai/*` 必须用 `withApi.admin`；服务层做二次校验。

### 🟠 高（High）

#### H-1 `judge/executor.ts` 中命令字符串拼接

- **位置**：`lib/judge/executor.ts` 构造 `child_process.exec/execSync` 命令（如 `compileCmd`、`runCmd`）。
- **影响**：若 `language` / `filename` / `workDir` 受控，可能造成命令注入；评测是 OJ 核心高危面。
- **修复**：使用 `spawn` + 数组参数；强制 `--` 分隔；限制 `cwd` 与 `env`。

#### H-2 测试点 ZIP 解析使用 `adm-zip` 且未限制条目大小/路径

- **位置**：`app/api/admin/testcases/upload/route.ts` → `parseTestCaseZip`（`adm-zip`）。
- **影响**：恶意 ZIP 含路径穿越（`../../../etc/passwd`）、超大条目（内存解压）、Zip Slip。
- **修复**：校验条目路径、限制总大小与单条大小、流式解压（`unzipper`）。

#### H-3 控制台日志直接打印用户输入 / 错误对象

- **位置**：`app/api/admin/testcases/upload/route.ts` 内的 `logger.info` 多处打印原始对象；`lib/contest/service.ts:583` 的 `console.error('加入队列失败:', queueError)`。
- **影响**：可能把代码、邮箱、栈信息写入日志；对接 Sentry/集中日志后造成数据泄漏。
- **修复**：日志字段脱敏；统一用 `lib/logger`，禁止在路由文件 `console.*`。

### 🟡 中（Medium）

| #   | 描述                                                                                                  | 位置                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M-1 | `withApi.public` 路由无 CSRF 保护（POST/PATCH/DELETE）                                                | `lib/api/withApi.ts`                                                   |
| M-2 | `JWT_SECRET` 同样未在 `withApi.ts` 校验（与 C-1 同源）                                                | `lib/api/withApi.ts`                                                   |
| M-3 | 头像分片上传 `init/chunk/complete` 缺服务层鉴权再确认                                                 | `app/api/users/avatar/upload/*`                                        |
| M-4 | 队列/缓存键硬编码字符串多处复用，缺统一常量                                                           | `lib/contest/service.ts` `cache.deleteByPrefix('contest:rank:...')` 等 |
| M-5 | `markdown` 渲染虽用 `rehype-sanitize`，但 `MarkdownContent.tsx` 是否配置 `allowedTags`/协议需二次确认 | `components/common/MarkdownContent.tsx`                                |
| M-6 | AI 题解生成用同步 `fetch`，无超时控制                                                                 | `lib/ai/factory.ts` / `discover.ts`（推断）                            |
| M-7 | `server.ts` 启动日志 `console.log` 打印路径                                                           | `server.ts` 顶部                                                       |

### 🟢 低（Low）

- 部分路由打印的 `logger.info` 用了 Emoji 📥📦📄 等，可统一抽取常量
- `package.json` `dev/start` 走 `tsx server.ts`，而 `dev:default` 才是 `next dev`，新人易踩坑
- `prisma generate` 与 `postinstall` 未在脚本里固化（依赖 husky.prepare）

### ♻️ 冗余 / 可清理

| #   | 描述                                                                                | 处理建议                   |
| --- | ----------------------------------------------------------------------------------- | -------------------------- |
| R-1 | `app/api/admin/ai/solution/status/route.ts` 与 `lib/ai/solution-queue.ts` 双源真相  | 合并为单一队列状态查询接口 |
| R-2 | `lib/api/handler.ts` 与 `lib/api/withApi.ts` 同时存在 → 风格不一致                  | 收敛为 `withApi` 一种      |
| R-3 | `provider-dns.ts`、`provider.ts`、`providers-presets/route.ts` 三个文件描述同一事物 | 合并为单一字典             |
| R-4 | `console.*` 与 `lib/logger` 混用                                                    | 全量替换为 `logger`        |
| R-5 | `server.ts` 顶部 `console.log('Server started...')` 与 `lib/logger.info` 重复       | 移除 console               |

---

## 3️⃣ 逻辑问题检查

### L-1 字段命名不一致（`aiStatus` vs `status`）

`Problem` 模型同时有 `aiStatus` 字段（标识 AI 生成来源），但前端/题解生成流程在 `lib/ai/solution-generator.ts` 中可能仍读取 `status`。需全链路统一枚举：
`MANUAL_CREATED | AI_ASSISTED | AI_GENERATED` —— 任一分支未走统一通道都可能导致 `ai` 队列处理错题。

**修复**：在 `lib/problem/service.ts` 显式断言 `aiStatus ∈ allowed`，并将所有写操作汇聚到一处 `setProblemAiStatus()`。

### L-2 评测失败时把 `submission.status` 写成 `'SE'`（系统错误），但状态机定义散落

`lib/contest/service.ts:586`：`status: 'SE', message: '评测系统错误，请稍后重试'` —— `'SE'` 在类型上没在 `SubmissionStatus` 中被显式声明（应是 `SYSTEM_ERROR`）。前端如按枚举渲染会显示成 `SE` 字面量。

**修复**：统一枚举常量；前端从单一来源渲染。

### L-3 竞赛提交失败兜底逻辑

`lib/contest/service.ts:581-588` 队列加入失败 → 把已落库的 `submission` 标记为 `SE`，但**没有回滚**题目提交计数（`incrementProblemSubmitCount`）。长尾上会让 `Problem.totalSubmits` 大于真实提交数。

**修复**：要么 `try/catch` 整个流程、失败时 `prisma.submission.delete`，要么把计数移到队列成功 ACK 后。

### L-4 AI 题解队列写入路径与状态读取路径

`solution-queue.ts` 写入，`/api/admin/ai/solution/status` 读取；若管理员在前端轮询期间，模型重命名 / 模型被禁用 / 服务商被禁用，存在『返回历史队列项但目标模型已下线』导致调用失败的隐患。

**修复**：队列项持久化时冻结模型与 provider 快照，状态查询直接走快照。

### L-5 默认值回退导致管理员页面空响应

`/api/admin/settings` 与 `/api/admin/dashboard` 若数据库无 `Setting` 行，前端渲染分页会崩。需要服务层「懒初始化」默认值。

### L-6 用户名 `username` 唯一性约束缺失可能性

`auth/register` 与 `admin/users/batch-register` 两路写库，唯一性约束可能在批量入口绕过（`createMany` 跳过唯一检查）。需校验。

### L-7 AI 提示词模板与运行时代码版本

`lib/ai/prompts/*` 与 `loader.ts` 存在版本未对齐风险（已在代码注释提示），模板更新若未走 CI 校验，会导致某些题型的 `response-parser` 解析失败 → 进入死信队列但无告警。

---

## 4️⃣ 运行匹配验证

| 检查项                              | 期望                                                 | 实际                                                                 | 结论                                                                                          |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node / Next                         | Next 16 + React 19 + Node ≥ 20                       | `package.json` 中 `next@16.0.0`、`react@19.2.0`、无 engines 限制     | ⚠️ 建议补 `engines: { node: ">=20.11" }`                                                      |
| Prisma                              | 6.x + MongoDB                                        | `@prisma/client ^6.17.1`、`mongodb ^6.20.0`                          | ✅ 一致                                                                                       |
| Redis                               | 队列与限流（推测）                                   | `ioredis ^5.9.2` 已声明；`lib/rate-limit.ts` 使用                    | ✅                                                                                            |
| Socket.IO                           | 实时评测推送                                         | `socket.io ^4.8.1` + `socket.io-client`                              | ✅                                                                                            |
| Tailwind                            | v4                                                   | `@tailwindcss/postcss ^4` + `tailwindcss ^4`                         | ✅                                                                                            |
| Markdown 渲染                       | `react-markdown` + `rehype-sanitize`                 | 声明齐全；`MarkdownContent.tsx` 需复查默认属性                       | ⚠️                                                                                            |
| Lint 流水线                         | Husky + lint-staged                                  | 已配置                                                               | ✅                                                                                            |
| Lint-staged 同时跑 `tsc --noEmit`   | 会卡提交                                             | `package.json:90` 写的是 `eslint --fix && tsc --noEmit` 在大仓会很慢 | ⚠️ 建议改为增量                                                                               |
| **AI Provider 默认模型**            | `deepseek-chat / -reasoner` 文档提示 2026/07/24 弃用 | `providers.ts` 注释已警示                                            | ⚠️ 已临近过期日期（与今日日期 2026-07-15 相差 9 天），需尽快迁移到 `deepseek-v4-flash / -pro` |
| 自定义 server                       | `tsx server.ts`                                      | 已配置                                                               | ✅                                                                                            |
| Next 内置 API 与自定义 Express 并存 | 双栈可工作                                           | `server.ts` 把 Socket.IO 挂到同一端口；`/api/*` 由 Next 处理         | ✅                                                                                            |

### 兼容性矩阵

| 浏览器 / 运行时                         | 支持情况                                   |
| --------------------------------------- | ------------------------------------------ |
| 现代 Chromium / Edge / Firefox / Safari | ✅（Tailwind v4 + Next 16 + React 19）     |
| Node 18                                 | ❌ Next 16 要求 Node ≥ 18.18，实际推荐 20+ |
| MongoDB 5.x / 6.x / 7.x                 | ✅ Prisma MongoDB 驱动兼容                 |

---

## 5️⃣ 优化评估建议（按优先级 P0-P3）

### P0 — 阻塞上线

1. **强制 JWT_SECRET 必填**，缺失直接拒启动
2. **修复 AI 模型管理路由角色鉴权**（C-2）
3. **评测命令参数化**（spawn + 数组），杜绝 child_process 注入
4. **测试点 ZIP 流式解析 + 路径/大小白名单**

### P1 — 上线后 1 周内

5. 统一 `console.*` → `lib/logger`，脱敏
6. `withApi.public` 的写方法加 CSRF token
7. 头像分片上传增加 `withApi` 服务层鉴权
8. DeepSeek 模型 ID 切换到 `deepseek-v4-*`
9. `SubmissionStatus` 统一枚举；`'SE'` 改为 `SYSTEM_ERROR`

### P2 — 上线后 2 周

10. `lib/api/handler.ts` 与 `withApi.ts` 收敛
11. AI 题解队列状态查询走快照模型
12. 解决 `Problem.aiStatus` 全链路写入一致性
13. 缓存键统一常量（`lib/cache/keys.ts`）
14. `Submission` 失败回滚题目提交计数（事务化）

### P3 — 长期

15. 接入 OpenTelemetry，统一 traceId 串联 HTTP/Prisma/Redis
16. 题解/评测结果推送走 WebSocket 单独 topic
17. AI 用量按 provider/model 维度生成日/周报
18. 引入 `zod` 统一前后端 schema，复用类型

---

## 6️⃣ 优化实施路线图（可勾选）

> Markdown 版使用 `- [ ]` 任务清单；下次再生成报告时，已勾选项可与历史对比。

### 阶段 1：上线前硬性修复（预计 3 天）

- [ ] C-1 强制 `JWT_SECRET`，缺则启动报错
- [ ] C-2 全量审查 `/api/admin/ai/*` 的 `withApi.admin` 包装
- [ ] H-1 评测命令改 `spawn` + 数组参数 + cwd/env 白名单
- [ ] H-2 替换 `adm-zip` 为 `unzipper`，加入路径穿越/大小校验
- [ ] L-2 `SubmissionStatus` 统一枚举与前端展示收敛

### 阶段 2：观测与一致性（预计 5 天）

- [ ] H-3 全量替换 `console.*` → `lib/logger`，字段脱敏
- [ ] L-1 `Problem.aiStatus` 写操作汇聚到单一函数
- [ ] L-3 队列加入失败回滚计数（事务化）
- [ ] M-1 公共写接口加 CSRF token
- [ ] M-3 头像分片上传服务层鉴权二次确认
- [ ] R-4 移除 `console.*`

### 阶段 3：架构清理（预计 1 周）

- [ ] R-2 收敛 `handler.ts` 与 `withApi.ts`
- [ ] R-3 合并 provider 相关三处定义
- [ ] R-1 合并 solution 状态接口
- [ ] L-4 AI 题解队列快照模型化
- [ ] L-5 admin 设置/仪表盘默认值懒初始化

### 阶段 4：长期演进

- [ ] P3-1 OpenTelemetry 接入
- [ ] P3-2 推送 topic 化
- [ ] P3-3 AI 用量报表
- [ ] P3-4 zod schema 共享
- [ ] P2-15~P2-18 收尾

---

## 7️⃣ 系统架构总览图

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Browser  (React 19 + Next.js 16)               │
│  ├ Pages (RSC) · Client Components · SWR · Socket.IO Client         │
│  └ Tailwind v4 · react-markdown · recharts · katex                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS / WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Custom Server  (server.ts · tsx · Node 20)              │
│   ┌───────────────────────────┐   ┌────────────────────────────┐     │
│   │  Next.js App Router       │   │  Socket.IO Server          │     │
│   │  /api/** (96 routes)      │   │  /socket.io  (评测推送)    │     │
│   │  middleware.ts            │   └────────────────────────────┘     │
│   └─────────────┬─────────────┘                                      │
│                 │                                                    │
│      ┌──────────┴───────────┐                                        │
│      ▼                      ▼                                        │
│  withApi.public       withApi.admin   ← 统一鉴权包装                │
│      │                      │                                        │
│      └──────────┬───────────┘                                        │
└─────────────────┼────────────────────────────────────────────────────┘
                  │
       ┌──────────┼──────────────────────────────────┐
       ▼          ▼          ▼          ▼             ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ Prisma │ │ Redis  │ │ Judge  │ │  AI    │ │ Mailer │
   │   6   │ │ioredis │ │executor│ │factory │ │ nodemailer│
   └───┬────┘ └────┬───┘ │compiler│ │queue   │ └───┬────┘
       │           │     └────┬───┘ └───┬────┘     │
       ▼           ▼          ▼         ▼          ▼
   ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────────────┐
   │MongoDB │  │  Cache │  │ child_ │  │ OpenAI / Anthropic│
   │  6.x   │  │  +限流 │  │ process│  │ DeepSeek / 国产   │
   └────────┘  └────────┘  └────────┘  └──────────────────┘
```

**关键依赖链**：

- `HTTP 请求 → middleware.ts → 路由 handler → withApi.* → lib/*/service.ts → prisma/redis/judge/AI/mailer`

---

## 8️⃣ 数据请求流程图

### 8.1 普通提交评测流程（以「竞赛题」为例）

```
[Browser]                  [Next.js]                 [Service]            [Queue]            [Worker]            [AI/外部]
   │                          │                         │                    │                  │                    │
   │ POST /api/contests/:id/submit                                                                                                  │
   ├─────────────────────────►│                                                                                                    │
   │                          │ withApi.admin(user)                                                                                │
   │                          ├─► 权限/角色校验                                                                                    │
   │                          │ service.submitContestCode                                                                          │
   │                          ├───────────────────────►│                                                                            │
   │                          │                         │ 校验：比赛时段、已注册、题目在比赛中                                         │
   │                          │                         │ prisma.contestProblem.findUnique                                                                    │
   │                          │                         │ prisma.submission.create                                                                              │
   │                          │                         │ prisma.problem.update (totalSubmits)                                                                  │
   │                          │                         │ addJudgeJob (Redis queue)                                                                              │
   │                          │                         ├───────────────────►│                                                                                │
   │                          │ ◄───────── 200 {submissionId} ──────────────┤                                                                                │
   │ ◄── 200 {id, status:PENDING} ─┤                                                                                                  │
   │                          │                         │                    │  worker.blpop                                                               │
   │                          │                         │                    ├───────────────►│                                                            │
   │                          │                         │                    │                 │ executor.compile/spawn                                             │
   │                          │                         │                    │                 │ judge test cases                                                   │
   │                          │                         │                    │ ◄─ progress ────┤                                                            │
   │ Socket.IO: submission:progress                                                                                                  │
   │ ◄──────────────────────────────── emit submission:status ─────────────────────────────────────────────────────────────────────────┤
   │                          │                         │                    │                 │ result callback                                                  │
   │                          │                         │ prisma.submission.update                                                                            │
   │                          │                         │ cache invalidation                                                                                    │
   │                          │                         │ ranking recalc                                                                                        │
```

### 8.2 AI 题解生成流程

```
[Admin]  POST /api/admin/problems/:id/regenerate-solution
        │
        ▼
   withApi.admin
        │
        ▼
   solution-generator.ts
        │  1) 读取 problem（含 testCases、tags）
        │  2) 加载 prompt 模板（prompts/* loader）
        │  3) 校验 provider + model 启用
        │  4) solution-queue.push({problemId, promptVersion, modelSnapshot})
        ▼
   Redis (ZSET)
        │
        ▼ (worker)
   AI Factory → OpenAI/Anthropic/DeepSeek HTTP
        │
        ▼
   response-parser → quality-check → Markdown 存储
        │
        ▼
   Solution 表写入 / Problem.aiStatus = "AI_GENERATED"
```

---

## 9️⃣ 附录：关键文件索引

- [server.ts](file:///e:/桌面/dsoj/server.ts) — 自定义服务器入口
- [next.config.ts](file:///e:/桌面/dsoj/next.config.ts) — Next 配置
- [middleware.ts](file:///e:/桌面/dsoj/middleware.ts) — 全局中间件
- [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma) — 数据模型
- [lib/api/withApi.ts](file:///e:/桌面/dsoj/lib/api/withApi.ts) — API 统一包装
- [lib/auth/index.ts](file:///e:/桌面/dsoj/lib/auth/index.ts) — JWT 鉴权
- [lib/judge/executor.ts](file:///e:/桌面/dsoj/lib/judge/executor.ts) — 评测执行
- [lib/ai/factory.ts](file:///e:/桌面/dsoj/lib/ai/factory.ts) — AI 工厂
- [lib/ai/solution-queue.ts](file:///e:/桌面/dsoj/lib/ai/solution-queue.ts) — AI 队列
- [app/api/admin/testcases/upload/route.ts](file:///e:/桌面/dsoj/app/api/admin/testcases/upload/route.ts) — 测试点上传
- [components/common/MarkdownContent.tsx](file:///e:/桌面/dsoj/components/common/MarkdownContent.tsx) — Markdown 渲染

---

## 🔚 结论

DSOJ 是一套**功能覆盖完整、模块边界清晰**的全栈 OJ 平台，亮点在于：

- API 统一封装（`withApi.public/admin`）
- 队列与限流基础设施到位
- AI 提供商抽象良好，支持 OpenAI/Anthropic/DeepSeek/国产多家

但**核心安全面（JWT 默认密钥、评测命令拼接、测试点 ZIP 解析）有不可忽视的 P0 风险**。建议按本报告"路线图阶段 1"先完成硬性修复，再开放公网访问。

> 下次生成报告时，可结合本报告的"路线图"勾选状态进行增量对比（HTML 模式支持 localStorage 记忆）。
