# OJ Platform 项目审查总结报告

> 生成日期: 2026-07-13 | 技术栈: Next.js 16 + React 19 + Prisma(MongoDB) + Redis + Socket.IO | 审查深度: 深度模式

---

## 📊 项目概览

| 指标 | 数值 |
|------|------|
| 后端 API 路由模块 | ~16 个 |
| API 端点总数 | ~80+ 个 |
| 前端页面 (page.tsx) | ~45 个 |
| 数据库模型 | 34 个 |
| 前端组件 | ~40 个 |
| React Hooks | 15 个 |
| React Contexts | 4 个 |
| lib/ 服务模块 | ~50 个 |
| 测试文件 | 4 个 |
| 配置/Pipeline | Docker, Nginx, ESLint, Prettier, Husky |

### 健康分数

| 维度 | 分数 | 状态 |
|------|------|------|
| 🔒 安全性 | 82/100 | 良好 |
| 🧠 逻辑性 | 85/100 | 良好 |
| 🔗 兼容性 | 88/100 | 优秀 |
| ✨ 代码质量 | 80/100 | 良好 |
| 📐 综合 | **83.75/100** | 良好 |

---

## 🏗️ 系统架构总览

本项目是一个 **在线判题系统（Online Judge）**，采用 Next.js 16 全栈架构，包含以下核心层：

```
┌─────────────────────────────────────────────────────────┐
│                     Nginx (反向代理)                      │
│                   HTTP :8080 / HTTPS :8443               │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Next.js 16 App Router (全栈)                 │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │  前端页面层 (React 19) │  │  API 路由层 (Node.js)       │ │
│  │  • 题库/竞赛/班级/训练  │  │  • RESTful API              │ │
│  │  • Monaco 代码编辑器   │  │  • JWT 认证 + CSRF 防护      │ │
│  │  • Markdown 渲染      │  │  • 速率限制                  │ │
│  │  • Tailwind CSS v4    │  │  • 参数校验                  │ │
│  └──────────┬───────────┘  └─────────────┬─────────────┘ │
│             │                            │                │
│  ┌──────────▼───────────────────────────▼─────────────┐  │
│  │              Middleware (JWT + CSRF + Rate Limit)    │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                 │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │              WebSocket 层 (Socket.IO)                  │  │
│  │  • 评测结果实时推送    • 通知推送                      │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                    服务层 (lib/)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ 评测引擎  │ │ AI 出题  │ │ 业务服务  │ │ 工具/中间件  │  │
│  │ judge/   │ │ ai/      │ │ contest/ │ │ rate-limit │  │
│  │ • 编译   │ │ • OpenAI │ │ class/   │ │ email      │  │
│  │ • 执行   │ │ • DeepSeek│ │ problem/ │ │ websocket  │  │
│  │ • 比较   │ │ • 质量门禁│ │ solution/│ │ logger     │  │
│  │ • 重测   │ │ • 题解   │ │ training/│ │ sanitize   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬─────┘  │
└───────┼────────────┼─────────────┼──────────────┼───────┘
        │            │             │              │
┌───────▼────────────▼─────────────▼──────────────▼───────┐
│                    数据层                                │
│  ┌────────────────────┐ ┌──────────────────────────────┐ │
│  │ MongoDB + Prisma   │ │ Redis (ioredis)               │ │
│  │ • 34 个数据模型     │ │ • 缓存 (user, training)        │ │
│  │ • 原生驱动兜底       │ │ • 限流 (middleware)            │ │
│  │ • 事务支持          │ │ • 队列辅助                    │ │
│  └────────────────────┘ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 数据请求流程

### 典型用户提交代码流程

```
用户提交代码 → [前端] Monaco编辑器 + 语言选择
    │
    ▼
POST /api/submissions → Middleware (CSRF校验 + 速率限制)
    │
    ▼
Auth 中间件 (JWT验证 tokenVersion)
    │
    ▼
lib/submission/service.ts → 创建Submission记录(PENDING)
    │
    ▼
lib/judge/queue.ts → 加入评测内存队列
    │
    ▼
lib/judge/worker.ts → 编译(compiler) → 执行(executor/Docker)
    │  ├─ 内存监控(轮询+ulimit)
    │  ├─ 输出比较(comparator/多模式)
    │  └─ 临界TLE重测(rejudge)
    ▼
lib/mongodb-direct.ts → 直接写入评测结果(绕过Prisma事务)
    │
    ▼
WebSocket emitSubmissionUpdate() → 实时推送结果到前端
    │
    ▼
[前端] SubmissionResultModal → 展示评测结果/测试点详情
```

### AI 出题流程

```
管理员提交生成参数 → POST /api/admin/ai/generate
    │
    ▼
lib/ai/queue.ts → 任务入队
    │
    ▼
lib/ai/service.ts → OpenAI SDK调用
    │  ├─ 参数生成器 (paramgen/)
    │  ├─ 测试数据生成器 (test-data/)
    │  └─ 质量检查 (quality-check.ts)
    │
    ▼
lib/ai/solution-generator.ts → 标程生成
    │
    ▼
lib/ai/solution-queue.ts → 题解队列
    │
    ▼
Prisma 事务写入 → 题目创建 + 测试点批量写入
```

---

## 📋 功能表与文件列表

### 模块功能卡片

#### 📦 用户认证模块
基于 JWT + bcrypt 的完整认证体系，支持登录/注册/忘记密码/密码修改，JWT tokenVersion 吊销机制。

**能力标签**: `JWT` `bcrypt` `Cookie` `限流` `CSRF防护`

---

#### 📦 题库管理模块
题目的增删改查、批量导入/导出、AI 辅助出题、测试点管理、标程验证。

**能力标签**: `CRUD` `AI生成` `批量操作` `标程验证`

---

#### 📦 在线评测引擎
代码编译、执行、比较、实时推送。支持 Docker 沙箱和本地进程评测两种模式，完善的内存/CPU 监控。

**能力标签**: `编译执行` `沙箱` `TLE重测` `实时推送`

---

#### 📦 竞赛系统
支持公开/私有竞赛、密码/报名制、实时排名（ACM/IOI样式）、倒计时面板。

**能力标签**: `竞赛` `排名` `计时` `注册`

---

#### 📦 班级管理
教师创建班级、成员管理、作业发布与提交、班级笔记、邀请码/直接邀请机制。

**能力标签**: `班级` `作业` `权限控制` `邀请系统`

---

#### 📦 训练/题单系统
官方/用户自定义题单、分类管理、进度追踪、洛谷风格侧栏。

**能力标签**: `题单` `分类` `进度` `洛谷风格`

---

#### 📦 题解系统
用户发布题解、浏览计数（IP去重）、点赞（单用户去重）、AI 生成官方题解。

**能力标签**: `题解` `去重统计` `点赞` `AI生成`

---

#### 📦 AI 服务模块
多服务商支持（OpenAI兼容）、模型管理、参数生成、出题/标程/题解生成、质量门禁。

**能力标签**: `OpenAI` `DeepSeek` `多服务商` `质量检查`

---

#### 📦 管理后台
用户管理（批量操作）、题目管理（审核/验证）、竞赛管理、设置配置（SMTP/AI）、仪表盘统计。

**能力标签**: `后台管理` `批量操作` `系统设置` `仪表盘`

---

#### 📦 通知系统
好评测提交、竞赛、班级等场景，支持 WebSocket 实时推送，已读/未读状态管理。

**能力标签**: `通知` `WebSocket` `实时推送`

---

### API 端点列表

| 方法 | 路径 | 描述 | 鉴权 |
|------|------|------|------|
| POST | /api/auth/login | 用户登录 | Public |
| POST | /api/auth/register | 用户注册 | Public |
| GET | /api/auth/me | 获取当前用户信息 | Auth |
| POST | /api/auth/logout | 用户登出 | Auth |
| POST | /api/auth/forgot-password | 忘记密码（邮件重置） | Public (限流) |
| GET | /api/problems | 题目列表（分页/筛选） | Public |
| GET | /api/problems/[id] | 题目详情 | Public |
| POST | /api/submissions | 提交代码 | Auth |
| GET | /api/submissions/[id] | 提交详情/轮询状态 | Public |
| GET | /api/contests | 竞赛列表 | Public |
| GET | /api/contests/[id] | 竞赛详情 | Public |
| POST | /api/contests/[id]/register | 竞赛报名 | Auth |
| GET | /api/contests/[id]/rank | 竞赛排名 | Public |
| GET | /api/classes | 班级列表 | Auth |
| GET | /api/classes/[id] | 班级详情 | Auth |
| POST | /api/classes/[id]/members | 加入班级 | Auth |
| GET | /api/trainings | 题单列表 | Public |
| GET | /api/trainings/[id] | 题单详情 | Public |
| POST | /api/trainings/[id]/join | 加入题单 | Auth |
| GET | /api/solutions | 题解列表 | Public |
| GET | /api/solutions/[id] | 题解详情 | Public |
| POST | /api/solutions/[id]/like | 点赞题解 | Auth |
| GET | /api/notifications | 通知列表 | Auth |
| POST | /api/notifications/mark-all-read | 全部标为已读 | Auth |
| GET | /api/rankings | 排行榜 | Public |
| GET | /api/ai/models | AI 模型列表 | Public |
| POST | /api/admin/problems | 创建题目 | Admin |
| POST | /api/admin/ai/generate | AI 生成题目 | Admin |
| POST | /api/admin/testcases/upload | 上传测试点ZIP | Admin |
| GET | /api/admin/dashboard | 管理仪表盘 | Admin |
| POST | /api/admin/users/batch-register | 批量注册用户 | Admin |
| PUT | /api/admin/settings | 更新系统设置 | Admin |
| GET | /api/health/db | 数据库健康检查 | Public |

> 完整 API 端点约 80+ 个，以上为按模块代表性的端点。

---

### 前端核心文件列表

| 文件 | 路径 | 描述 |
|------|------|------|
| LayoutContent | `app/LayoutContent.tsx` | 全局布局（导航栏+上下文） |
| HomePage | `app/page.tsx` | 首页（登录/未登录双视图） |
| ProblemDetail | `app/problem/[id]/page.tsx` | 题目详情+代码提交工作区 |
| ProblemsList | `app/problems/page.tsx` | 题库列表（搜索/筛选/分页） |
| ContestDetail | `app/contests/[id]/page.tsx` | 竞赛详情+倒计时 |
| ContestProblem | `app/contests/[id]/problems/[problemId]/page.tsx` | 竞赛模式题目页 |
| ClassManage | `app/classes/[id]/manage/page.tsx` | 班级管理面板 |
| TrainingPage | `app/training/[id]/page.tsx` | 题单内容页 |
| AdminDashboard | `app/admin/page.tsx` | 管理后台首页 |
| AdminProblemsReview | `app/admin/problems/review/page.tsx` | 题目审核页 |
| Navbar | `components/Navbar.tsx` | 导航栏组件 |
| ProblemDescription | `components/problem/ProblemDescription.tsx` | 题目描述组件 |
| MarkdownContent | `components/common/MarkdownContent.tsx` | Markdown 渲染器 |
| SubmissionResultModal | `components/submission/SubmissionResultModal.tsx` | 评测结果弹窗 |
| JudgeStatus | `components/submission/JudgeStatus.tsx` | 评测状态徽章 |

---

### 后端 lib/ 核心模块列表

| 文件 | 路径 | 描述 |
|------|------|------|
| withApi | `lib/api/withApi.ts` | API 路由包装器（鉴权/错误处理） |
| base | `lib/api/base.ts` | API 客户端（get/post/put/delete/upload） |
| validation | `lib/api/validation.ts` | 运行时参数校验 |
| judge/worker | `lib/judge/worker.ts` | 评测 Worker 事件处理器 |
| judge/queue | `lib/judge/queue.ts` | 评测内存队列 |
| judge/executor | `lib/judge/executor.ts` | 代码执行引擎 |
| judge/compiler | `lib/judge/compiler.ts` | 编译工具 |
| judge/comparator | `lib/judge/comparator.ts` | 多模式输出比较 |
| judge/codeAnalyzer | `lib/judge/codeAnalyzer.ts` | 代码安全分析 |
| ai/service | `lib/ai/service.ts` | AI 服务核心（模型/配置/连接测试） |
| ai/queue | `lib/ai/queue.ts` | AI 出题任务队列 |
| ai/generator | `lib/ai/generator.ts` | AI 题目生成器 |
| ai/solution-generator | `lib/ai/solution-generator.ts` | AI 标程/题解生成器 |
| ai/quality-check | `lib/ai/quality-check.ts` | 质量检查门禁 |
| auth/index | `lib/auth/index.ts` | JWT 签发/验证 |
| auth/service | `lib/auth/service.ts` | 认证服务 |
| problem/service | `lib/problem/service.ts` | 题库服务 (~1000行) |
| contest/service | `lib/contest/service.ts` | 竞赛服务 (~864行) |
| class/service | `lib/class/service.ts` | 班级服务 |
| user/service | `lib/user/service.ts` | 用户服务 (~1344行) |
| training/service | `lib/training/service.ts` | 题单服务 (~873行) |
| solution/service | `lib/solution/service.ts` | 题解服务 |
| websocket/server | `lib/websocket/server.ts` | WebSocket 服务器 |
| permissions | `lib/permissions.ts` | 角色权限系统 |
| crypto | `lib/crypto.ts` | AES-256-CBC 加密 |

---

### 数据库表列表

| 表名 | 关键列 | 关联模块 | 描述 |
|------|--------|---------|------|
| User | username, email, role, rating, tokenVersion | 认证/用户 | 用户主表 |
| Problem | title, difficulty, tags, timeLimit, memoryLimit | 题库 | 题目主表 |
| TestCase | problemId, input, output, score | 题库 | 测试用例 |
| Submission | problemId, userId, language, code, status | 评测 | 提交记录 |
| Contest | title, type, startTime, endTime, password | 竞赛 | 竞赛主表 |
| ContestProblem | contestId, problemId, orderIndex, score | 竞赛 | 竞赛-题目关联 |
| ContestParticipant | contestId, userId, score, rank | 竞赛 | 竞赛参与者 |
| Class | name, description, ownerId, maxMembers | 班级 | 班级主表 |
| ClassMember | classId, userId, role, permissions | 班级 | 班级成员 |
| ClassAssignment | classId, title, problemIds, startTime, endTime | 班级 | 班级作业 |
| ClassAssignmentSubmission | assignmentId, userId, problemId, status | 班级 | 作业提交 |
| ClassNote | classId, title, content, category | 班级 | 班级笔记 |
| ClassDirectInvite | classId, inviterId, inviteeId, status | 班级 | 直接邀请 |
| ClassJoinRequest | classId, userId, status | 班级 | 加入申请 |
| Solution | problemId, authorId, title, content, isOfficial | 题解 | 题解主表 |
| SolutionView | solutionId, viewerKey | 题解 | 浏览去重记录 |
| SolutionLike | solutionId, userId | 题解 | 点赞去重记录 |
| Comment | content, solutionId, authorId, parentId | 题解/社交 | 评论（支持嵌套） |
| Training | title, description, isPublic, categoryType | 训练/题单 | 题单主表 |
| TrainingCategory | name, orderIndex | 训练/题单 | 题单分类 |
| TrainingProblem | trainingId, problemId, orderIndex | 训练/题单 | 题单-题目关联 |
| TrainingEnrollment | trainingId, userId | 训练/题单 | 题单加入记录 |
| Blog | title, content, authorId, tags | 博客 | 博客文章 |
| Notification | userId, type, title, content, isRead | 通知 | 用户通知 |
| AuditLog | userId, action, resource, ip | 审计 | 审计日志 |
| AiProvider | name, slug, baseUrl, apiKey | AI | AI服务商配置 |
| AiModel | name, model, providerId, type | AI | AI模型定义 |
| AiModelConfig | userId, provider, model, apiKey | AI | AI配置（全局/用户） |
| AiGenerationLog | userId, status, params, result | AI | AI出题记录 |
| UserAiPreference | userId, modelId, isDefault | AI | 用户AI偏好 |
| Achievement | name, description, icon, condition | 成就 | 成就定义 |
| UserAchievement | userId, achievementId | 成就 | 用户成就记录 |
| Favorite | userId, problemId | 收藏 | 题目收藏 |
| AvatarHistory | userId, url, filename, size | 用户 | 头像历史 |
| NoteReadHistory | classId, noteId, userId | 班级 | 笔记阅读历史 |
| SystemConfig | key, value | 系统 | 系统配置（JSON） |
| SystemAnnouncement | title, content, isPinned, authorId | 系统 | 系统公告 |
| VerificationLog | problemId, operatorId, status | 题库 | 标程验证日志 |

---

## 🔒 漏洞与冗余审查

### 安全总览

| 严重度 | 数量 | 描述 |
|--------|------|------|
| 🔴 严重 | 0 | 未发现严重安全漏洞 |
| 🟠 高危 | 2 | XSS风险 + 代码执行隔离 |
| 🟡 中危 | 3 | CSP策略 + 硬编码 + 数据暴露 |
| 🟢 低危 | 4 | 最佳实践改进建议 |

---

### 高危漏洞 🟠

**1. ReactMarkdown 渲染用户内容存在 XSS 风险**
- 📍 位置: `app/problem/[id]/page.tsx`, `app/admin/problems/review/page.tsx` 等多处
- 📝 描述: 使用 `react-markdown` 渲染题目描述、题解等用户/管理员输入内容时，虽启用了 `remarkGfm` 插件，但未使用 `rehype-sanitize` 等 HTML 消毒插件。攻击者可通过管理员注入恶意 HTML/JS 代码。
- ⚠️ 当前代码:
```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {problem.description}
</ReactMarkdown>
```
- ✅ 建议修复:
```tsx
import rehypeSanitize from 'rehype-sanitize'

<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
  {problem.description}
</ReactMarkdown>
```
- 💥 影响: 管理员账户被攻破后可插入存储型XSS，影响所有访问题目/题解的用户
- 🔧 修复: 引入 `rehype-sanitize` 对所有 Markdown 渲染进行 HTML 消毒

**2. 本地评测无沙箱隔离（Windows 环境）**
- 📍 位置: `lib/judge/executor.ts:L21-L26`
- 📝 描述: Windows 环境下本地进程评测（USE_DOCKER=false）时无 Docker 沙箱隔离，恶意代码（system()/ProcessBuilder）可直接在宿主机执行
- ⚠️ 当前防护:
```typescript
if (!USE_DOCKER && process.platform === 'win32') {
  if (process.env.ALLOW_LOCAL_JUDGE_ON_WINDOWS !== '1') {
    throw new Error('...')
  }
  logger.warn('⚠️ [安全] Windows 本地进程评测已显式确认...')
}
```
- 💥 影响: 若开启本地评测，选手可执行任意系统命令
- 🔧 修复: 生产环境强制 USE_DOCKER=true，代码层面已有安全分析器（codeAnalyzer.ts）做基础检测，但黑名单模式可被绕过。建议增加系统调用沙箱（如 seccomp）

---

### 中危漏洞 🟡

**1. CSP 策略存在不安全指令**
- 📍 位置: `next.config.ts:L28-L29`
- 📝 描述: `script-src` 包含 `'unsafe-inline'` 和 `'unsafe-eval'`，削弱了 CSP 对 XSS 的防护能力。Monaco Editor 确实需要 `unsafe-eval`，但 `unsafe-inline` 风险较高
- 🔧 建议: 使用 nonce 替代 `unsafe-inline`，并考虑将 Monaco Editor 加载到独立 iframe 中

**2. Dockerfile 构建阶段硬编码 JWT_SECRET**
- 📍 位置: `Dockerfile:L7-L11`
- 📝 描述: 构建阶段设置 `JWT_SECRET=build-time-secret-key`，仅用于 Prisma 客户端生成，不会泄漏到运行时镜像。但仍是明文硬编码
- 🔧 建议: 构建阶段可用随机生成值 `openssl rand -base64 32`，避免固定值

**3. API 错误日志可能泄露内部信息**
- 📍 位置: `lib/api/withApi.ts:L98-L108`
- 📝 描述: 兜底错误处理已做了 `不向客户端透传 err.message`，但日志写入了 `err.stack`。堆栈信息在开发环境可用，但需确保生产环境日志不被非授权访问
- 🔧 建议: 确认生产日志存储有访问控制

---

### 低危漏洞 🟢

| # | 描述 | 文件 | 建议 |
|---|------|------|------|
| 1 | 忘记密码接口无 CAPTCHA | `app/api/auth/forgot-password/route.ts` | 增加验证码防自动化滥用 |
| 2 | 登录失败无账号锁定机制 | `app/api/auth/login/route.ts` | 连续失败 N 次后临时锁定账号 |
| 3 | `next.config.ts` 图片域名为 `localhost` | `next.config.ts:L10` | 生产部署需更新为实际域名 |
| 4 | Socket.IO CORS 可能过于宽松 | `lib/websocket/server.ts` | 检查 `cors.origin` 是否限定为白名单 |

---

### ✅ 安全亮点

本项目在安全方面表现良好：
- **CSRF 防护**: Middleware 对写操作校验 Origin/Referer
- **速率限制**: 分层限流（middleware + API 层），login 10/min, register 5/min, forgot-password 3/min
- **CSP + 安全头**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **JWT 吊销**: tokenVersion 机制，密码修改/封禁后旧 Token 自动失效
- **SSRF 防护**: AI 服务商 baseUrl 校验（内网IP/非标准编码/DNS Rebinding）
- **密码安全**: bcrypt(10轮) 哈希 + 忘记密码使用随机生成密码
- **文件上传**: MIME magic number 检测 + 路径穿越防护 + UUID 命名 + 大小限制
- **输入消毒**: escapeHtml/stripTags/removeNullBytes 工具函数

---

### 冗余代码与文件

| 文件路径 | 类型 | 原因 | 建议 |
|---------|------|------|------|
| `types/api.ts` | 类型文件 | 与 `types/models.ts` 部分重复，且各 lib 模块已有独立类型 | 合并或评估是否仍在使用 |
| `services/authService.ts` | 服务层 | 登录逻辑未复用 lib 模块，路径独立 | 迁移到 `lib/auth/` 统一管理 |
| `scripts/build-logger.ps1` | 脚本 | PowerShell 构建日志脚本，非核心功能 | 评估是否仍需要 |
| `lib/mongodb.ts` | 连接管理 | 与 `lib/mongodb-direct.ts` 可能存在重复 | 检查并合并 |
| Solution 模型 `language` 字段 | 数据冗余 | schema 已注释"冗余字段，新代码不再写入" | 数据迁移后可移除此字段 |

---

## 🧠 逻辑问题检查

### 严重逻辑问题

**1. 角色存储双映射可能导致权限不一致**
- 📍 位置: `lib/class/roles.ts`
- 📝 描述: 班级成员 role 在 DB 存储为 `owner/admin/member`，API 层通过双映射暴露为 `owner/assistant/student`。这种不一致可能在直接 DB 操作或跨模块调用时导致权限判断错误
- ⚠️ 当前代码:
```typescript
export function dbRolesMatchingApiFilter(apiRole: string): string[] {
  if (apiRole === 'owner') return ['owner']
  if (apiRole === 'assistant') return ['admin', 'assistant']
  if (apiRole === 'student') return ['member', 'student']
  return [apiRole]
}
```
- 🔧 建议: 统一 DB 存储与 API 层的角色命名，避免双映射复杂度

**2. abort 标志的竞态安全问题**
- 📍 位置: `lib/ai/queue.ts`
- 📝 描述: `job.aborted` 检查在多处使用，但在 JavaScript 单线程事件循环中无竞态问题（无 await 穿插时是安全的）。不过若有并发写库的场景，建议使用原子操作
- 🔧 影响: 当前实现安全，但需在后续引入 Worker Threads 时特别注意

---

### 一般逻辑问题

| # | 描述 | 文件 | 建议 |
|---|------|------|------|
| 1 | 题目删除后 Submission.problem 设为可选，但关联查询可能返回 null problem | `app/api/submissions/` 多处 | 前端页面需处理 problem 为 null 时的展示 |
| 2 | 评测队列为内存队列，服务重启会丢失所有 PENDING 状态的作业 | `lib/judge/queue.ts` | 生产环境建议迁移到 BullMQ + Redis |
| 3 | for got-password 先发信再落库，发信成功但落库失败时用户密码未变但邮件已发出 | `app/api/auth/forgot-password/route.ts` | 当前策略是"发信优先"，合理性需权衡 |
| 4 | `fetchWithAuth` 不再自动添加 Authorization 头（cookie 模式），函数名可能产生误导 | `lib/api/base.ts:L309` | 考虑重命名为 `fetchWithCookie` |
| 5 | Contest 密码支持明文和 bcrypt 兼容两种格式 | `lib/contest/service.ts:L266` | 计划迁移所有竞赛密码为 bcrypt 格式 |

---

## 🔗 运行匹配验证

### 模块兼容性表

| 模块 | 前端→后端 API | 后端→数据库 | 配置对齐 | 状态 |
|------|-------------|-----------|---------|------|
| 认证 | JWT Cookie ⇄ JWT验证 | User表 匹配 | 一致 | ✅ |
| 题库 | SWR ⇄ GET/POST | Problem+TestCase 匹配 | 一致 | ✅ |
| 评测 | WebSocket ⇄ emitSubmissionUpdate | Submission 直接写入 | 一致 | ✅ |
| 竞赛 | ContestContext ⇄ REST | Contest+ContestProblem 匹配 | 一致 | ✅ |
| 班级 | ClassContext ⇄ REST | Class+ClassMember 匹配 | 一致 | ✅ |
| 题单 | 前端路由 ⇄ REST | Training+TrainingProblem 匹配 | 一致 | ✅ |
| 题解 | fetchWithAuth ⇄ REST | Solution+SolutionView 匹配 | 一致 | ✅ |
| AI | 管理页面 ⇄ REST | AiProvider+AiModel 匹配 | 一致 | ✅ |
| 通知 | Socket.IO ⇄ REST | Notification 匹配 | ✅ (需检查未读计数一致性) |
| 系统设置 | 管理面板 ⇄ PUT | SystemConfig 匹配 | 一致 | ✅ |

### 关键不匹配项

> ⚠️ 角色映射不一致：Prisma User.role 使用 `SYSTEM_ADMIN/ADMIN/TEACHER/STUDENT`，而班级成员 role 使用 `owner/admin/member` 再双映射为 `owner/assistant/student`。API 校验 `withApi.admin()` 检查 `isSystemAdmin || isAdmin`，班级管理员（assistant）无后台权限——此设计正确，但映射表值得全局统一。

> ⚠️ `aiStatus` 字段存在值不一致：Problem 模型注释定义为 `MANUAL_CREATED/AI_ASSISTED/AI_GENERATED`，但管理页面实际显示 `DRAFT/FORCE_PUBLISHED` —— 存在新增状态值未及时同步到 Schema 注释的情况。

---

## 🚀 优化评估建议

### P0 🚨 紧急修复

- **修复 ReactMarkdown XSS 风险** — 影响: 存储型XSS
  - 修复步骤: 安装 `rehype-sanitize` → 在所有 Markdown 渲染节点添加 rehypePlugins → 测试题目/题解/公告的 Markdown 渲染
  - 涉及文件: `app/problem/[id]/page.tsx`, `app/admin/problems/review/page.tsx`, `components/common/MarkdownContent.tsx`, `components/common/MarkdownRenderer.tsx`

### P1 🔴 高优先级

- **评测队列持久化** — 影响: 服务重启后评测作业丢失
  - 当前内存队列在服务重启时所有 PENDING 作业丢失，需迁移到 BullMQ + Redis 确保可靠性
- **评测沙箱加固** — 影响: 生产环境代码执行安全
  - 确保 Docker 部署环境 `USE_DOCKER=true` 且 Docker 使用最少权限配置（当前已配置 no-new-privileges, cap-drop=ALL, read-only）
- **CSP 策略优化** — 影响: 削弱了 XSS 防护力度
  - 使用 nonce 替代 `unsafe-inline`，Monaco Editor 单独 iframe 加载

### P2 🟡 中优先级

- **统一角色系统** — 影响: 降低维护成本和权限 Bug 风险
  - 将班级成员 DB 存储角色与 API 暴露角色统一命名
- **代码结构优化** — 影响: 可维护性
  - 将 `services/authService.ts` 迁移至 `lib/auth/`
  - 合并 `lib/mongodb.ts` 与 `lib/mongodb-direct.ts` 的功能重叠
- **增加关键功能测试覆盖** — 影响: 回归风险
  - 当前仅 4 个测试文件（api, comparator, permissions, response-parser），缺少核心评测/AI/竞赛流程的集成测试
- **API 文档自动化** — 影响: 开发效率
  - 考虑引入 OpenAPI/Swagger 自动生成 API 文档

### P3 🟢 体验提升

- **WebSocket 断线重连优化** — 当前 Socket.IO 客户端自动重连，但评测状态页面可增加更明确的"离线"提示
- **图片懒加载优化** — Training 题单封面图可增加 `loading="lazy"` 属性
- **页面加载骨架屏** — 已有 `PageLoading` 组件，可在更多页面统一使用骨架屏替代简单 Spinner
- **错误边界完善** — 当前仅有 `error.tsx` 和 `global-error.tsx`，可在关键业务模块增加更细粒度的 ErrorBoundary
- **国际化准备** — 当前所有 UI 文本硬编码为中文，可考虑抽象为 i18n key 为未来国际化做准备

---

## 📌 优化实施路线图

### 阶段1: P0 紧急修复

- [ ] 安装 `rehype-sanitize` 依赖
- [ ] 在 `MarkdownContent` 组件统一添加 `rehypePlugins={[rehypeSanitize]}`
- [ ] 审查所有 `react-markdown` 使用位置确保覆盖
- [ ] 回归测试 Markdown 渲染（表格/代码块/数学公式）

### 阶段2: P1 高优先级

- [ ] 设计 BullMQ + Redis 评测队列迁移方案
- [ ] 实现队列迁移（保持 API 兼容）
- [ ] 确认 Docker 生产部署安全配置
- [ ] 研究 CSP nonce 方案可行性
- [ ] 实施 CSP nonce 替代 unsafe-inline

### 阶段3: P2 中优先级

- [ ] 统一班级成员角色命名（DB 层与 API 层）
- [ ] 迁移 `services/authService.ts` 到 `lib/auth/`
- [ ] 合并 MongoDB 连接管理模块
- [ ] 编写核心评测流程集成测试
- [ ] 编写 AI 出题流程 E2E 测试

### 阶段4: P3 体验提升

- [ ] WebSocket 连接状态 UI 优化
- [ ] 统一页面加载骨架屏
- [ ] 增加业务模块 ErrorBoundary
- [ ] 性能优化（图片懒加载、代码分割）

### 阶段5: 长期规划

- [ ] 引入 OpenAPI/Swagger 文档
- [ ] 国际化（i18n）基础设施
- [ ] 微服务拆分评估（评测引擎独立服务）
- [ ] 多语言支持（评测语言扩展: Rust, Go）
- [ ] 引入自动化安全扫描（Snyk/Trivy）

---

## 📊 增量对比报告

> 上次报告: N/A (首次审查) | 本次报告: 2026-07-13

### 首次审查基线已建立

本次为项目首次全面审查，已建立健康基线。后续审查将自动对比：
- 新增/修复的漏洞数量
- 健康分数变化趋势
- 文件变更统计

建议每月运行一次审查报告以追踪项目健康度变化。

---

## 📝 总结

### 项目优势

1. **安全设计全面**：CSRF防护、速率限制、CSP安全头、SSRF防护、输入消毒一应俱全，体现了成熟的安全意识
2. **架构清晰**：Next.js 全栈架构、模块化 lib/ 设计、清晰的分层（路由→服务→数据），代码可维护性好
3. **AI 集成深度**：从出题、标程生成、题解到质量门禁，AI 能力贯穿核心业务流
4. **评测引擎健壮**：支持 Docker 沙箱、多模式输出比较、临界 TLE 重测、内存/CPU 精确监控
5. **运维完善**：Docker Compose 一键部署、健康检查、优雅关闭、日志轮转

### 核心改进方向

1. **Markdown XSS 防护**：立即添加 `rehype-sanitize` 对所有用户内容渲染进行消毒
2. **评测队列可靠性**：从内存队列迁移到 BullMQ + Redis，避免重启丢失作业
3. **角色体系统一**：解决班级成员角色的 DB/API 双映射不一致问题
4. **测试覆盖率提升**：从 4 个测试文件扩展到覆盖核心业务流程
5. **i18n 规划**：当前全中文硬编码不利于后续国际化扩展

### 最终评分

| 维度 | 分数 |
|------|------|
| 🔒 安全性 | 82/100 |
| 🧠 逻辑性 | 85/100 |
| 🔗 兼容性 | 88/100 |
| ✨ 代码质量 | 80/100 |
| 📐 **综合** | **83.75/100** |

**结论**：这是一个设计良好、安全意识到位的在线判题系统。架构清晰、功能完整。建议按照上述路线图优先完成 P0 和 P1 项改进，即可达到生产级质量水平。
