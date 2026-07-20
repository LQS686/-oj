# DSOJ（大山 OJ）项目审查总结报告

> 生成日期: 2026-07-20 | 技术栈: Next.js 16 + Prisma + MongoDB + React 19 + TypeScript | 审查深度: 深度模式
> 审查原则: 从实际出发，基于现有技术栈修复，不引入新模块

---

## 📊 项目概览

| 指标 | 数值 |
|------|------|
| 页面数（app/**/page.tsx） | 76 |
| API 路由数（app/api/**/route.ts） | 125 |
| 布局文件（app/**/layout.tsx） | 32 |
| 组件数（components/**/*.tsx） | 67 |
| lib 模块数（lib/**/*.ts） | 约 203 |
| Prisma 数据模型 | 49 |
| 自定义 Hook | 7 |
| React Context | 4 |
| 测试文件 | 10 |
| 文档文件 | 3 |

### 健康分数

| 维度 | 分数 | 状态 |
|------|------|------|
| 🔒 安全性 | 82/100 | 🟢 良好 |
| 🧠 逻辑性 | 70/100 | 🟡 需改进 |
| 🔗 兼容性 | 80/100 | 🟢 良好 |
| ✨ 代码质量 | 72/100 | 🟡 需改进 |

**评分依据**：
- **安全性 82**：SSRF/XSS/JWT/文件上传/数据库注入等关键防护到位，扣分项为 CSP 含 `unsafe-inline`、开发环境 CORS `*`、4 处命令拼接模式、IPv6 校验遗漏
- **逻辑性 70**：5 个 High 级逻辑问题（状态机 fail-open、AI handler 不一致、批量改角色权限校验缺失、状态字段大小写、评测器零测试覆盖）
- **兼容性 80**：前后端 API 匹配良好无缺失，扣分项为类型字段缺失、环境变量校验不集中、限流白名单路径错误
- **代码质量 72**：6 个 High（死代码、测试缺口）、19 个 Medium、16 个 Low；存在重复模块和 deprecated 未清理

---

## 🏗️ 系统架构总览

DSOJ 采用 **Next.js 16 自定义 Server 模式**，单进程承载 Next.js Handler、WebSocket、评测 Worker 三大职责，部署于 Docker 容器，通过 Nginx 反向代理暴露 `https://dsoj.run`。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         浏览器 / 第三方客户端                          │
└────────────┬────────────────────────────────────┬───────────────────┘
             │ HTTPS                              │ WSS (Socket.IO)
             ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Nginx (nginx/nginx.conf)                       │
│  server_name dsoj.run | HTTP→HTTPS 301 | 反向代理 → 127.0.0.1:3000   │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Docker 容器 (Dockerfile, standalone)                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Node.js 进程 (server.ts:0.0.0.0:3000)            │   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │  前置路由 1: 头像分片直传 (handleAvatarChunkDirect)     │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │  前置路由 2: 静态文件 /uploads/* (serveStaticUpload)    │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │  Next.js Handler (app.getRequestHandler)               │ │   │
│  │  │   ├─ App Router 页面 (76 page.tsx)                     │ │   │
│  │  │   ├─ API Routes (125 route.ts)                        │ │   │
│  │  │   └─ middleware.ts (CSRF + RateLimit + AdminGuard)    │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │  WebSocket Server (lib/websocket/server.ts)            │ │   │
│  │  │   └─ Socket.IO path=/socket.io                        │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │  评测 Worker (lib/judge/init.ts)                       │ │   │
│  │  │   ├─ JudgeQueue (单例，setInterval 死任务检测)          │ │   │
│  │  │   ├─ Compiler (spawn g++/gcc/python)                  │ │   │
│  │  │   └─ Executor (Docker 沙箱: --network none --cap-drop) │ │   │
│  │  ├────────────────────────────────────────────────────────┤ │   │
│  │  │  启动钩子: resetStaleTasksOnStartup (AI 残留任务清理)   │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────┬───────────────────┬──────────────────┬────────────────────┘
         │                   │                  │
         ▼                   ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ MongoDB 主从     │ │ Redis (ioredis)  │ │ Docker 评测容器   │
│ (Prisma + 原生)  │ │ 限流/缓存        │ │ gcc/python/ubuntu│
│ prisma: 主       │ │                 │ │ --network none   │
│ prismaRo: 从     │ │                 │ │ --read-only      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 核心基础设施模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 自定义 Server | [server.ts](file:///e:/桌面/dsoj/server.ts) | 启动 HTTP/WS/Worker、前置路由、优雅关闭 |
| 中间件 | [middleware.ts](file:///e:/桌面/dsoj/middleware.ts) | JWT 鉴权、CSRF、限流、requestId |
| API 封装 | [lib/api/withApi.ts](file:///e:/桌面/dsoj/lib/api/withApi.ts) | public/auth/admin/systemAdmin/classRole |
| Prisma 双客户端 | [lib/prisma.ts](file:///e:/桌面/dsoj/lib/prisma.ts) | 主库(写) + 从库(读) |
| MongoDB 原生 | [lib/mongodb/](file:///e:/桌面/dsoj/lib/mongodb) | 绕过 Prisma 直查（性能优化） |
| Redis | [lib/redis.ts](file:///e:/桌面/dsoj/lib/redis.ts) | 限流、缓存 |
| 内存缓存 | [lib/cache.ts](file:///e:/桌面/dsoj/lib/cache.ts) | LRU + singleflight |
| 评测核心 | [lib/judge/](file:///e:/桌面/dsoj/lib/judge) | 编译、执行、判定、队列 |
| AI 流水线 | [lib/ai/](file:///e:/桌面/dsoj/lib/ai) | 出题、相似度、质量评分 |
| 权限 | [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts) | 4 级 RBAC 唯一真相源 |

---

## 🔄 数据请求流程

### 1. 用户提交代码评测流程

```
用户点击提交
   │
   ▼
[POST /api/submissions] (withApi.auth)
   │
   ├─ middleware.ts: CSRF 校验 Origin/Referer → RateLimit (20/min) → JWT 解析 → requestId 注入
   │
   ▼
[lib/submission/service.ts: submitCode]
   │
   ├─ 校验题目存在 + 用户权限
   ├─ createSubmissionDirect (MongoDB 原生写入)
   │    └─ status: 'Pending' → 'PENDING' (字段大小写不一致问题)
   │
   ▼
[lib/judge/queue.ts: enqueue] (内存队列)
   │
   ▼
[lib/judge/worker.ts] (Worker 异步消费)
   │
   ├─ lib/judge/compiler.ts: spawn g++ -O2 -std=c++17 (Docker 内)
   │    └─ 编译失败 → status: CE
   │
   ├─ lib/judge/executor-core.ts: spawn docker run --network none --cap-drop ALL
   │    ├─ TLE/MLE/RE → 对应状态
   │    └─ 正常退出 → lib/judge/comparator.ts 比较 output
   │
   ▼
[updateSubmissionDirect] (MongoDB 原生更新)
   │
   ├─ cache.delete('submission:byId:...')
   ├─ WebSocket 推送 (lib/websocket/server.ts: emitToUser)
   │
   ▼
前端 useSubmissionSocket Hook 接收实时状态
```

### 2. AI 出题流程（六步流水线）

```
管理员提交 AI 出题请求
   │
   ▼
[POST /api/admin/ai/generate] (withApi.admin)
   │
   ▼
[lib/ai/service/generation.ts: enqueueAiGeneration]
   ├─ ⚠️ create + addAiJob 非事务（孤儿 PENDING 风险）
   │
   ▼
[lib/ai/queue/index.ts: AiQueue] (单例内存队列)
   │
   ├─ Step 1: lib/ai/generator.ts → 调用 AI Provider (safeFetch SSRF 防护)
   │           └─ 生成题面 + C++ 标程 + 测试输入（仅 input，无 output）
   │
   ├─ Step 2: lib/ai/quality-check.ts: checkGeneratedProblem (同步签名)
   │           ├─ 5 维质量评分（完整性/正确性/覆盖度/难度匹配/可读性）
   │           ├─ checkProblemSimilarityFromDb (异步 DB 查询)
   │           └─ 排除 avoidDuplicateWith 预注入候选
   │
   ├─ Step 3: lib/judge/compiler.ts: 编译 C++ 标程
   │           └─ validateCodeSafety 静态检测（system/exec/popen）
   │
   ├─ Step 4: lib/ai/queue/handlers/parametric.ts: 执行标程生成 output
   │           ├─ runSolutionValidation（每条 input 跑标程）
   │           ├─ ⚠️ test-data.ts 失败 continue vs parametric.ts throw FAILED（不一致）
   │           └─ finally 清理编译产物
   │
   ├─ Step 5: 样例数据拷贝到 TestCase 表
   │
   └─ Step 6: commitPreviewedProblem (prisma.$transaction) → Problem 入库
```

### 3. 前端页面请求流程

```
浏览器导航 → Next.js Server Component 渲染
   │
   ├─ Server Component (默认)
   │    ├─ 直接调用 lib/* service 层
   │    └─ 无需经过 fetch
   │
   └─ Client Component (use client)
        ├─ SWR Hook (useSWR) → fetch /api/* → withApi 鉴权 → Prisma → JSON
        ├─ fetchWithCookie (lib/api/base.ts) 自动携带 Cookie
        └─ WebSocket Hook (useSubmissionSocket/useNotificationSocket) → 实时推送
```

---

## 📋 功能表与文件列表

### 模块功能卡片

#### 📦 题目模块（Problem）
题库管理、题目详情、测试用例、AI 出题、批量操作、CSV 导出

**能力标签**: `CRUD` `批量` `导出` `AI生成` `测试用例` `验证`

**关键文件**: [lib/problem/](file:///e:/桌面/dsoj/lib/problem) | [app/problems/](file:///e:/桌面/dsoj/app/problems) | [app/api/problems/](file:///e:/桌面/dsoj/app/api/problems)

---

#### 📦 提交与评测模块（Submission & Judge）
代码提交、Docker 沙箱评测、状态机管理、实时推送、死任务恢复

**能力标签**: `评测` `Docker沙箱` `状态机` `实时推送` `容错恢复`

**关键文件**: [lib/judge/](file:///e:/桌面/dsoj/lib/judge) | [lib/submission/](file:///e:/桌面/dsoj/lib/submission) | [lib/constants/submission-status.ts](file:///e:/桌面/dsoj/lib/constants/submission-status.ts)

---

#### 📦 竞赛模块（Contest）
竞赛创建/编辑、报名、题目管理、实时排行榜（含罚时）、提交可见性控制

**能力标签**: `CRUD` `报名` `排行榜` `罚时` `可见性控制`

**关键文件**: [lib/contest/](file:///e:/桌面/dsoj/lib/contest) | [app/contests/](file:///e:/桌面/dsoj/app/contests)

---

#### 📦 班级模块（Class）
班级管理、成员角色（owner/admin/member）、作业、笔记、邀请、加入申请、成员活跃度

**能力标签**: `CRUD` `角色管理` `作业` `笔记` `邀请` `活跃度统计`

**关键文件**: [lib/class/](file:///e:/桌面/dsoj/lib/class) (21 个文件) | [app/classes/](file:///e:/桌面/dsoj/app/classes)

---

#### 📦 训练/题单模块（Training）
题单创建、分类、加入、进度跟踪、班级关联

**能力标签**: `CRUD` `分类` `进度跟踪` `班级关联`

**关键文件**: [lib/training/](file:///e:/桌面/dsoj/lib/training) | [app/training/](file:///e:/桌面/dsoj/app/training)

---

#### 📦 用户模块（User）
注册/登录、JWT 鉴权、个人资料、头像分片上传、排行榜、设置

**能力标签**: `认证` `JWT` `头像上传` `排行榜` `设置`

**关键文件**: [lib/auth/](file:///e:/桌面/dsoj/lib/auth) | [lib/user/](file:///e:/桌面/dsoj/lib/user) | [lib/ranking/](file:///e:/桌面/dsoj/lib/ranking)

---

#### 📦 AI 模块
AI 出题、题解生成、相似度检测、质量评分、Provider 管理、模型健康度

**能力标签**: `AI出题` `相似度检测` `质量评分` `Provider管理` `队列`
**注意**: 当前 `AI_FEATURE_DISABLED = true`，所有 AI 入口渲染 `AiDisabledNotice`，业务代码活跃但运行时不可达

**关键文件**: [lib/ai/](file:///e:/桌面/dsoj/lib/ai) (53+ 文件) | [components/ai/](file:///e:/桌面/dsoj/components/ai) (19 组件)

---

#### 📦 题解模块（Solution）
题解发布、查看权限控制、点赞去重、浏览记录

**能力标签**: `CRUD` `权限控制` `点赞` `浏览记录`

**关键文件**: [lib/solution/](file:///e:/桌面/dsoj/lib/solution) | [app/problems/[id]/solutions/](file:///e:/桌面/dsoj/app/problems)

---

#### 📦 管理后台（Admin）
22 个管理页面，覆盖用户/题目/提交/竞赛/班级/训练/公告/AI 全功能管理

**能力标签**: `管理` `统计` `批量操作` `审计日志`

**关键文件**: [app/admin/](file:///e:/桌面/dsoj/app/admin) | [lib/admin/](file:///e:/桌面/dsoj/lib/admin)

---

### API 端点列表（按模块分组）

| 模块 | 方法 | 路径 | 描述 | 控制器 |
|------|------|------|------|--------|
| 认证 | POST | /api/auth/login | 登录 | [login/route.ts](file:///e:/桌面/dsoj/app/api/auth/login/route.ts) |
| 认证 | POST | /api/auth/register | 注册 | [register/route.ts](file:///e:/桌面/dsoj/app/api/auth/register/route.ts) |
| 认证 | POST | /api/auth/logout | 登出 | [logout/route.ts](file:///e:/桌面/dsoj/app/api/auth/logout/route.ts) |
| 认证 | GET | /api/auth/me | 获取当前用户 | [me/route.ts](file:///e:/桌面/dsoj/app/api/auth/me/route.ts) |
| 认证 | POST | /api/auth/forgot-password | 忘记密码 | [forgot-password/route.ts](file:///e:/桌面/dsoj/app/api/auth/forgot-password/route.ts) |
| 题目 | GET/POST | /api/problems | 题库列表/创建 | [problems/route.ts](file:///e:/桌面/dsoj/app/api/problems/route.ts) |
| 题目 | GET/PUT/DELETE | /api/problems/[id] | 题目详情 | [problems/[id]/route.ts](file:///e:/桌面/dsoj/app/api/problems/[id]/route.ts) |
| 提交 | GET/POST | /api/submissions | 提交列表/创建 | [submissions/route.ts](file:///e:/桌面/dsoj/app/api/submissions/route.ts) |
| 提交 | GET | /api/submissions/[id] | 提交详情 | [submissions/[id]/route.ts](file:///e:/桌面/dsoj/app/api/submissions/[id]/route.ts) |
| 竞赛 | GET/POST | /api/contests | 竞赛列表/创建 | [contests/route.ts](file:///e:/桌面/dsoj/app/api/contests/route.ts) |
| 竞赛 | GET | /api/contests/[id]/rank | 排行榜 | [contests/[id]/rank/route.ts](file:///e:/桌面/dsoj/app/api/contests/[id]/rank/route.ts) |
| 班级 | GET/POST | /api/classes | 班级列表/创建 | [classes/route.ts](file:///e:/桌面/dsoj/app/api/classes/route.ts) |
| 班级 | GET/POST | /api/classes/[id]/assignments | 作业管理 | [assignments/route.ts](file:///e:/桌面/dsoj/app/api/classes/[id]/assignments/route.ts) |
| AI | POST | /api/admin/ai/generate | AI 出题 | [generate/route.ts](file:///e:/桌面/dsoj/app/api/admin/ai/generate/route.ts) |
| AI | POST | /api/admin/ai/problems/commit | 提交 AI 题目 | [commit/route.ts](file:///e:/桌面/dsoj/app/api/admin/ai/problems/commit/route.ts) |
| 用户 | GET/PUT | /api/users/profile | 个人资料 | [profile/route.ts](file:///e:/桌面/dsoj/app/api/users/profile/route.ts) |
| 用户 | POST | /api/users/avatar/upload/chunk | 头像分片上传 | [chunk/route.ts](file:///e:/桌面/dsoj/app/api/users/avatar/upload/chunk/route.ts) |

> 完整 125 个 API 路由详见各模块目录，此处仅列出代表性端点

---

### 后端文件列表（核心）

| 文件 | 路径 | 描述 |
|------|------|------|
| server.ts | [server.ts](file:///e:/桌面/dsoj/server.ts) | 自定义 Next.js 服务器入口 |
| middleware.ts | [middleware.ts](file:///e:/桌面/dsoj/middleware.ts) | 路由保护、CSRF、限流 |
| withApi | [lib/api/withApi.ts](file:///e:/桌面/dsoj/lib/api/withApi.ts) | API 路由统一封装 |
| prisma | [lib/prisma.ts](file:///e:/桌面/dsoj/lib/prisma.ts) | Prisma 主从双客户端 |
| mongodb | [lib/mongodb/client.ts](file:///e:/桌面/dsoj/lib/mongodb/client.ts) | MongoDB 原生客户端 |
| redis | [lib/redis.ts](file:///e:/桌面/dsoj/lib/redis.ts) | Redis 客户端封装 |
| cache | [lib/cache.ts](file:///e:/桌面/dsoj/lib/cache.ts) | 内存 LRU 缓存 |
| auth | [lib/auth/index.ts](file:///e:/桌面/dsoj/lib/auth/index.ts) | JWT 工具 |
| permissions | [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts) | 4 级 RBAC |
| judge | [lib/judge/](file:///e:/桌面/dsoj/lib/judge) | 评测系统全套 |
| ai | [lib/ai/](file:///e:/桌面/dsoj/lib/ai) | AI 流水线全套 |
| safeFetch | [lib/ai/fetch-safe.ts](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts) | SSRF 防护 fetch |

### 数据库表列表（49 个 model）

| 表名 | 关键列 | 关联模块 | 状态 |
|------|--------|---------|------|
| User | id, username, email, password, role | 全模块 | ✅ 活跃 |
| Problem | id, problemNumber, title, description | 题目 | ✅ 活跃 |
| Submission | id, problemId, userId, status, score | 提交 | ✅ 活跃 |
| Contest | id, title, type, startTime, endTime | 竞赛 | ✅ 活跃 |
| Class | id, name, description, avatar | 班级 | ✅ 活跃 |
| ClassMember | id, classId, userId, role | 班级 | ✅ 活跃 |
| ClassAssignment | id, classId, title, problemIds | 班级作业 | ✅ 活跃 |
| Training | id, title, difficulty, categoryType | 训练 | ✅ 活跃 |
| Solution | id, problemId, authorId, content | 题解 | ✅ 活跃 |
| AiGenerationLog | id, userId, status, params, result | AI | ✅ 活跃 |
| AiProvider | id, name, baseUrl, apiKey | AI | ✅ 活跃 |
| AiModel | id, name, model, providerId | AI | ✅ 活跃 |
| TestCase | id, problemId, input, output | 题目 | ✅ 活跃 |
| Notification | id, userId, type, title | 通知 | ✅ 活跃 |
| SystemAnnouncement | id, title, content, isPublished | 公告 | ✅ 活跃 |
| AuditLog | id, userId, action, resource | 审计 | ✅ 活跃 |
| CoinTransaction | id, userId, amount, balanceAfter | 游戏化 | ⚠️ Phase 1 预留 |
| ShopItem | id, name, category, price | 游戏化 | ⚠️ Phase 1 预留 |
| PurchaseTransaction | id, userId, itemId, pricePaid | 游戏化 | ⚠️ Phase 1 预留 |
| NoteReadHistory | id, classId, noteId, userId | 班级笔记 | ❌ 无代码引用 |
| Blog | id, title, content, authorId | 博客 | ❌ 无服务层 |

> 完整 49 个 model 详见 [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma)

---

## 🔒 漏洞与冗余审查

### 严重漏洞 🔴

> 无 Critical 级漏洞

---

### 高危漏洞 🟠

#### 1. CSP 含 `'unsafe-inline'` 削弱 XSS 防护

- 📍 位置: [next.config.ts:30](file:///e:/桌面/dsoj/next.config.ts#L30)
- 📝 描述: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`，允许内联脚本，削弱 CSP 防 XSS 能力。注释说明为兼容 Next.js 内联引导脚本
- ⚠️ 漏洞代码:
```typescript
"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
```
- ✅ 修复代码:
```typescript
// 在 middleware 中为每个请求生成 nonce，注入到 CSP 头
// next.config.ts 移除 'unsafe-inline'，改用 'nonce-{nonce}'
"script-src 'self' 'nonce-{nonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
```
- 💥 影响: 攻击者注入的内联脚本可绕过 CSP 执行
- 🔧 修复: 使用 Next.js 13+ 的 nonce-based CSP（不引入新依赖）

---

#### 2. 开发环境 WebSocket CORS `origin: '*'` + `credentials: true`

- 📍 位置: [lib/websocket/server.ts:117](file:///e:/桌面/dsoj/lib/websocket/server.ts#L117)
- 📝 描述: 开发环境 CORS origin 为 `*` 且 `credentials: true`，违反 CORS 规范。开发环境若误暴露到公网，任意域可建立 WebSocket 连接
- ⚠️ 漏洞代码:
```typescript
io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
```
- ✅ 修复代码:
```typescript
origin: process.env.NODE_ENV === 'production'
  ? process.env.FRONTEND_URL
  : (process.env.DEV_ORIGIN || 'http://localhost:3000'),
```
- 💥 影响: 开发环境公网暴露时任意域可建立 WebSocket
- 🔧 修复: 改用具体 origin（不引入新依赖）

---

#### 3. AI 功能整体下线但代码仍活跃

- 📍 位置: [lib/ai/feature-flag.ts](file:///e:/桌面/dsoj/lib/ai/feature-flag.ts) | [components/ai/](file:///e:/桌面/dsoj/components/ai) (21 组件) | [lib/ai/](file:///e:/桌面/dsoj/lib/ai) (53+ 文件)
- 📝 描述: `AI_FEATURE_DISABLED = true`，所有 AI 入口渲染 `AiDisabledNotice`，但 21 个 AI 组件 + 53+ lib/ai 模块仍活跃。代码无运行时风险，但维护成本高，且 `components/ai/ModelSelector.tsx` 已 `@deprecated` 零引用
- ⚠️ 漏洞代码:
```typescript
// lib/ai/feature-flag.ts
export const AI_FEATURE_DISABLED = true
```
- ✅ 修复: 业务决策已知，建议：(1) 删除 `components/ai/ModelSelector.tsx`（零引用 deprecated）；(2) 在 README 或 docs/ 明确下线状态及恢复计划；(3) 若长期不恢复，考虑分支归档
- 💥 影响: 维护成本高，新人易误用 deprecated 组件
- 🔧 修复: 删除 deprecated 组件，文档化下线状态

---

### 中危漏洞 🟡

#### 4. `docker image inspect ${image}` 命令拼接

- 📍 位置: [lib/judge/docker.ts:93](file:///e:/桌面/dsoj/lib/judge/docker.ts#L93)
- 📝 描述: `image` 当前来自硬编码 Record（不可被用户控制），但字符串拼接模式不规范。若未来 `getDockerImage` 改为配置读取，将立即变成 Critical
- ⚠️ 漏洞代码:
```typescript
execSync(`docker image inspect ${image}`, { stdio: 'ignore', timeout: 5000 })
```
- ✅ 修复代码:
```typescript
const result = spawnSync('docker', ['image', 'inspect', image], {
  stdio: 'ignore', timeout: 5000
})
if (result.status !== 0) { /* 镜像不存在 */ }
```
- 🔧 修复: 改用 spawn 数组形式（不引入新依赖）

---

#### 5. `docker cp ${containerId}:...` 命令拼接

- 📍 位置: [lib/judge/executor-core.ts:163](file:///e:/桌面/dsoj/lib/judge/executor-core.ts#L163)
- 📝 描述: `containerId` 由 timestamp + crypto.randomBytes 构造，不可控；`statsPath` 由 join 构造。当前不可利用，模式不规范
- ⚠️ 漏洞代码:
```typescript
execSync(`docker cp ${containerId}:/tmp/time_stats.txt ${statsPath}`, { timeout: 5000 })
```
- ✅ 修复代码:
```typescript
spawnSync('docker', ['cp', `${containerId}:/tmp/time_stats.txt`, statsPath], { timeout: 5000 })
```
- 🔧 修复: 改用 spawn 数组形式

---

#### 6. IPv4-mapped IPv6 校验遗漏

- 📍 位置: [lib/ai/fetch-safe.ts:60-65](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts#L60-L65)
- 📝 描述: `isPrivateIpv6` 未覆盖 IPv4-mapped IPv6 地址（如 `::ffff:127.0.0.1`、`::ffff:169.254.169.254`），攻击者可能通过该格式绕过内网校验访问云元数据端点
- ⚠️ 漏洞代码:
```typescript
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  return false
}
```
- ✅ 修复代码:
```typescript
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return false
}
```
- 🔧 修复: 补充映射地址校验

---

#### 7. `getUserFullInfo` 死代码返回 password 哈希

- 📍 位置: [lib/user/service.ts:~1200](file:///e:/桌面/dsoj/lib/user/service.ts)
- 📝 描述: 函数返回完整 User 记录（含 password 哈希），无任何调用方。若未来误调用将导致密码哈希泄漏
- ⚠️ 漏洞代码:
```typescript
export async function getUserFullInfo(id: string) {
  return prisma.user.findUnique({ where: { id } })  // 返回完整 User 含 password
}
```
- ✅ 修复: 直接删除该函数（如未来需要，强制使用 `select` 排除敏感字段后重新添加）
- 💥 影响: 误调用导致 password 哈希泄漏
- 🔧 修复: 删除死代码

---

#### 8. CSP `connect-src` 含 localhost 通配

- 📍 位置: [next.config.ts:33](file:///e:/桌面/dsoj/next.config.ts#L33)
- 📝 描述: `http://localhost:*` 和 `ws://localhost:*` 用于开发环境，生产环境若误留可能允许回连本地服务
- ⚠️ 漏洞代码:
```typescript
"connect-src 'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
```
- ✅ 修复代码:
```typescript
const isProd = process.env.NODE_ENV === 'production'
const connectSrc = isProd
  ? "'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net"
  : "'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net"
```
- 🔧 修复: 根据 NODE_ENV 动态生成 CSP

---

#### 9. middleware CSRF 在 Origin/Referer 均缺失时放行

- 📍 位置: [middleware.ts:67-69](file:///e:/桌面/dsoj/middleware.ts#L67-L69)
- 📝 描述: 写操作 CSRF 校验在 Origin 和 Referer 均缺失时放行，依赖后续鉴权层。某些旧浏览器或隐私增强模式可能不发送 Referer
- ⚠️ 漏洞代码:
```typescript
// 同源 POST 且无 Origin/Referer：浏览器同源请求至少会携带 Referer
// 缺失两者可能是非浏览器客户端，放行由鉴权层处理
return true
```
- ✅ 修复代码:
```typescript
// 对敏感写操作（修改密码、删除用户）强制要求 Origin/Referer 之一存在
if (!origin && !referer) {
  if (sensitivePaths.some(p => req.nextUrl.pathname.startsWith(p))) {
    return false
  }
}
return true
```
- 🔧 修复: 对敏感操作严格校验

---

#### 10. 重复 MongoDB 客户端实现

- 📍 位置: [lib/mongodb.ts](file:///e:/桌面/dsoj/lib/mongodb.ts) vs [lib/mongodb/client.ts](file:///e:/桌面/dsoj/lib/mongodb/client.ts)
- 📝 描述: 两套 MongoDB 客户端实现并存。`lib/mongodb.ts`（NextAuth 风格单例）仅被 `app/api/users/avatar/upload/complete/route.ts` 引用；`lib/mongodb/client.ts`（带重试的新模式）被其他所有模块使用
- ✅ 修复: 将 avatar complete 路由迁移到 `lib/mongodb/client.ts`，删除 `lib/mongodb.ts`
- 🔧 修复: 统一 MongoDB 客户端

---

#### 11. 重复校验模块

- 📍 位置: [lib/validation.ts](file:///e:/桌面/dsoj/lib/validation.ts) vs [lib/api/validation.ts](file:///e:/桌面/dsoj/lib/api/validation.ts)
- 📝 描述: `lib/validation.ts` 整个模块标记 `@deprecated`，仍被 3 个文件引用：`lib/auth/login-service.ts`、`lib/user/batch.ts`、`app/api/auth/register/route.ts`
- ✅ 修复: 将 3 个引用方迁移到 `lib/api/validation.ts`，删除 `lib/validation.ts`
- 🔧 修复: 完成迁移后删除旧模块

---

#### 12. `fetchWithAuth` deprecated 别名仍被 67 个文件引用

- 📍 位置: [lib/api/base.ts:337](file:///e:/桌面/dsoj/lib/api/base.ts#L337)
- 📝 描述: `fetchWithAuth` 是 `fetchWithCookie` 的 deprecated 别名，仍被 67 个文件引用，技术债
- ✅ 修复: 批量 sed 替换 `fetchWithAuth` → `fetchWithCookie`，最后删除别名
- 🔧 修复: 制定迁移计划，分批替换

---

#### 13. Deprecated 路由零调用

- 📍 位置: [app/api/admin/problems/[id]/regenerate-solution/route.ts](file:///e:/桌面/dsoj/app/api/admin/problems/[id]/regenerate-solution/route.ts)
- 📝 描述: `@deprecated` 标记的 308 重定向到 `/api/admin/ai/solution/regenerate`，前端零调用
- ✅ 修复: 确认无外部依赖后删除该路由
- 🔧 修复: 删除 deprecated 路由

---

### 低危漏洞 🟢

| # | 描述 | 文件 | 建议 |
|---|------|------|------|
| 1 | `taskkill /F /T /PID ${pid}` 命令拼接 | [lib/judge/executor-core.ts:304,366](file:///e:/桌面/dsoj/lib/judge/executor-core.ts#L304) | 改用 `spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)])` |
| 2 | `tasklist /fi "PID eq ${safePid}"` 命令拼接 | [lib/judge/process-stats.ts:64](file:///e:/桌面/dsoj/lib/judge/process-stats.ts#L64) | 改用 `spawnSync('tasklist', ['/fi', ...])` |
| 3 | 头像清理 `Math.random() < 0.01` 触发 | [app/api/users/avatar/upload/init/route.ts:10](file:///e:/桌面/dsoj/app/api/users/avatar/upload/init/route.ts#L10) | 改用 `crypto.randomBytes(2).readUInt16BE(0) / 65535` |
| 4 | JWT 过期时间 7 天偏长 | [lib/auth/index.ts:53](file:///e:/桌面/dsoj/lib/auth/index.ts#L53) | 缩短至 24h + refresh token，或保持现状（有 tokenVersion 吊销兜底） |
| 5 | 头像分片大小硬编码 2MB 未配置化 | [server.ts](file:///e:/桌面/dsoj/server.ts) (handleAvatarChunkDirect) | 抽取为常量或环境变量 |
| 6 | `lib/security/csrf.ts` 预留未集成 | [lib/security/csrf.ts](file:///e:/桌面/dsoj/lib/security/csrf.ts) | 当前由 middleware Origin/Referer 同源校验防护，可保留预留 |

---

### 冗余代码与文件

| 文件路径 | 类型 | 原因 | 建议 |
|---------|------|------|------|
| [lib/user/service.ts:~1200](file:///e:/桌面/dsoj/lib/user/service.ts) `getUserFullInfo` | 死代码 | 返回 password 哈希，零调用 | 删除 |
| [components/ai/ModelSelector.tsx](file:///e:/桌面/dsoj/components/ai/ModelSelector.tsx) | Deprecated 组件 | `@deprecated use AiModelPicker`，零引用 | 删除 |
| [app/api/admin/problems/[id]/regenerate-solution/route.ts](file:///e:/桌面/dsoj/app/api/admin/problems/[id]/regenerate-solution/route.ts) | Deprecated 路由 | 308 重定向，零调用 | 删除 |
| [lib/validation.ts](file:///e:/桌面/dsoj/lib/validation.ts) | Deprecated 模块 | 整个模块 @deprecated，3 个引用待迁移 | 迁移后删除 |
| [lib/mongodb.ts](file:///e:/桌面/dsoj/lib/mongodb.ts) | 重复实现 | 与 lib/mongodb/client.ts 重复 | 迁移 1 个引用后删除 |
| [lib/constants/submission-status.ts:114](file:///e:/桌面/dsoj/lib/constants/submission-status.ts#L114) `canTransition_REMOVED` | 未使用导出 | 仅定义无调用 | 删除 |
| [lib/ai/service/logs.ts:50](file:///e:/桌面/dsoj/lib/ai/service/logs.ts#L50) `listUserAiGenerations` | Deprecated 别名 | 标记 deprecated | 迁移调用方后删除 |
| [lib/ai/quality-check.ts:118](file:///e:/桌面/dsoj/lib/ai/quality-check.ts#L118) | 历史注释 | `// const VALID_DIFFICULTIES 已移除` | 删除注释 |
| [issue-review-report.md](file:///e:/桌面/dsoj/issue-review-report.md) | 历史报告 | 2026-07-16 一次性产物 | 移到 docs/history/ 或删除 |
| [summary-report.md](file:///e:/桌面/dsoj/summary-report.md) | 历史报告 | 2026-07-16 一次性产物 | 移到 docs/history/ 或删除（本次会覆盖） |
| [tsconfig.json:38-39](file:///e:/桌面/dsoj/tsconfig.json#L38-L39) | 配置冗余 | `".next\\dev/types/**/*.ts"` 重复两次 | 删除重复行 |
| [eslint.config.js:59-81](file:///e:/桌面/dsoj/eslint.config.js#L59-L81) | 配置冗余 | 5 条规则在两个 block 重复定义 | 合并到单一 block |
| [app/admin/ai-generation/page.tsx](file:///e:/桌面/dsoj/app/admin/ai-generation/page.tsx) | 孤立路由 | "旧路径保留为路由壳"，无导航入口 | 加 redirect 或删除 |
| [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma) `NoteReadHistory` | 未启用 model | 全代码库无引用 | 确认后删除 |
| [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma) `Blog` | 未启用 model | User 关系存在 `blogs Blog[]`，无 blog 服务 | 确认后删除 |
| [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma) `Solution.codePython` | Schema 冗余字段 | Task 26.5，types/ai.ts 注释"不再生成 Python 标程" | 数据迁移后删除 |
| [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma) `Solution.language` | Schema 冗余字段 | 注释"冗余字段，新代码不再写入" | 旧数据迁移后删除 |

---

## 🧠 逻辑问题检查

### 致命逻辑错误

> 无 Fatal 级逻辑错误

---

### 严重逻辑问题

#### 1. `canTransition` 状态机 fail-open（未知状态默认放行）

- 📍 位置: [lib/constants/submission-status.ts:215](file:///e:/桌面/dsoj/lib/constants/submission-status.ts#L215)
- 📝 描述: 当 `normalizeStatus(from)` 返回 `undefined`（未知状态），`ALLOWED_TRANSITIONS[f]` 为 `undefined`，函数 `return true` 直接放行。一旦新增 status 枚举值未及时维护 `ALLOWED_TRANSITIONS`，所有非法转换都会被默认允许，状态机保护形同虚设
- ⚠️ 错误代码:
```typescript
export function canTransition(from: string, to: string): boolean {
  const f = normalizeStatus(from) || from
  const t = normalizeStatus(to) || to
  const allowed = ALLOWED_TRANSITIONS[f]
  if (!allowed) return true   // ← 未知 from 状态默认放行
  return allowed.has(t)
}
```
- ✅ 修复代码:
```typescript
if (!allowed) {
  logger.warn(`[状态机] 未知源状态: ${f}, 目标: ${t}，已拒绝`)
  return false  // fail-closed
}
```
- 🔧 修复: 改 fail-closed + 补充枚举遍历测试

---

#### 2. `test-data.ts` 与 `parametric.ts` 标程校验失败行为不一致

- 📍 位置: [lib/ai/queue/handlers/test-data.ts:104-118](file:///e:/桌面/dsoj/lib/ai/queue/handlers/test-data.ts#L104-L118) vs [lib/ai/queue/handlers/parametric.ts:195-200](file:///e:/桌面/dsoj/lib/ai/queue/handlers/parametric.ts#L195-L200)
- 📝 描述: 项目约束明确"任何测试用例执行失败应将整个生成任务标记为 FAILED"。`parametric.ts` 严格遵守 throw FAILED，但 `test-data.ts` 的 `runSolutionValidation` 失败时仅 `continue` 跳过，导致部分测试用例缺失入库，最终用户提交时可能命中未验证的测试点被误判 WA（参考 Lessons Learned）
- ⚠️ 错误代码:
```typescript
// test-data.ts 第 104-118 行：TLE/RuntimeError → continue（跳过）
for (...) {
  try {
    const result = await runSolutionValidation(...)
    if (!result.success) continue   // ← 跳过，不抛错
  } catch {
    continue                        // ← 异常吞掉
  }
}

// parametric.ts 第 195-200 行：相同失败场景 → throw FAILED
if (!result.success) {
  throw new Error(`测试用例执行失败: ${result.stderr || 'unknown'}`)
}
```
- ✅ 修复代码:
```typescript
// test-data.ts 对齐 parametric.ts
if (!result.success) {
  throw new Error(`测试用例执行失败: ${result.stderr || 'unknown'}`)
}
```
- 🔧 修复: test-data.ts 失败行为与 parametric.ts 对齐

---

#### 3. `batchUpdateUserRole` 未显式调用 `assertAssignableRole`

- 📍 位置: [lib/user/admin.ts:257-266](file:///e:/桌面/dsoj/lib/user/admin.ts#L257-L266)
- 📝 描述: 项目 Hard Constraint 明确"User management APIs must validate operator role permissions via `assertAssignableRole(role, operatorRole)` before processing role updates"。API route 层已校验，但 lib 层 `batchUpdateUserRole` 未显式调用，若被其他路径调用（管理员脚本、迁移工具）将绕过校验
- ⚠️ 错误代码:
```typescript
// batchUpdateUserRole 第 257-266 行
for (const item of users) {
  // ❌ 缺少 assertAssignableRole(item.role, operatorRole)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: item.id }, data: { role: item.role } })
  })
  await clearUserCache(item.id)
}
```
- ✅ 修复代码:
```typescript
async function batchUpdateUserRole(users: Array<{id: string, role: Role}>, operatorRole: Role) {
  for (const item of users) {
    assertAssignableRole(item.role, operatorRole)  // 显式校验
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: item.id }, data: { role: item.role } })
    })
    await clearUserCache(item.id)
    await clearAuthUserCache(item.id)  // 显式双保险
  }
}
```
- 🔧 修复: lib 层显式调用 assertAssignableRole + clearAuthUserCache 双保险

---

#### 4. 提交状态字段大小写不一致（'PENDING' vs 'Pending'）

- 📍 位置: [lib/submission/service.ts:67](file:///e:/桌面/dsoj/lib/submission/service.ts#L67) 与 [lib/submission/service.ts:144](file:///e:/桌面/dsoj/lib/submission/service.ts#L144)
- 📝 描述: 同一文件创建 Submission 时 status 字面量大小写不一致。第 67 行写入 `'PENDING'`（最终入库值），第 144 行作为入参传 `'Pending'`。目前因 `...data` 展开被覆盖可工作，但属于隐性依赖——一旦重构第 67 行去掉硬编码，第 144 行的 `'Pending'` 会直接落库，触发 Lessons Learned 中"大小写不一致导致 recover 路径失败"问题
- ⚠️ 错误代码:
```typescript
// 第 67 行（createSubmissionDirect）
data: {
  ...data,
  status: 'PENDING',      // 大写（最终入库）
  submittedAt: new Date(),
}

// 第 144 行（submitCode 入参）
const submission = await createSubmissionDirect({
  ...
  status: 'Pending',     // 首字母大写（被覆盖）
  totalTests: problem.testCases.length,
})
```
- ✅ 修复代码:
```typescript
// 统一使用枚举常量
import { SubmissionStatus } from '@/lib/constants/submission-status'

// 第 67 行
data: { ...data, status: SubmissionStatus.PENDING, submittedAt: new Date() }

// 第 144 行
status: SubmissionStatus.PENDING,
```
- 🔧 修复: 统一使用 `SubmissionStatus.PENDING` 枚举常量

---

#### 5. 评测器核心模块零单元测试

- 📍 位置: [tests/](file:///e:/桌面/dsoj/tests) 目录下无 `judger.test.ts` / `executor-core.test.ts` / `compiler.test.ts`
- 📝 描述: 评测器是 OJ 核心，涉及编译、Docker 隔离、资源统计、超时/OOM 处理等高风险逻辑，但无任何单元测试。`executor-core.ts` 的 Docker spawn、内存轮询、多级 kill 等逻辑回归风险高
- ✅ 修复: 补充以下测试：
  1. `tests/judge/compiler.test.ts`：mock spawnCompile，测试 cleanup 删除 compiledPath 与 sourcePath
  2. `tests/judge/executor-core.test.ts`：mock spawn，测试 TLE/MLE/RE/正常退出 4 个分支
  3. `tests/judge/judger.test.ts`：mock compileCode + executeCode，测试 CE/AC/WA 组合路径
- 🔧 修复: 补充评测器单元测试（不引入新依赖，使用 vitest mock）

---

### 一般逻辑问题

| # | 描述 | 文件 | 建议 |
|---|------|------|------|
| 1 | stderr 截断阈值不一致（500 vs 2000） | [lib/judge/judger.ts:117](file:///e:/桌面/dsoj/lib/judge/judger.ts#L117) | 引入 `STDERR_TRUNCATE_LENGTH = 2000` 常量统一 |
| 2 | `submission/service.ts` 缓存键格式不统一 | [lib/submission/service.ts:86](file:///e:/桌面/dsoj/lib/submission/service.ts#L86) | 迁移到 `CacheKeys.submission.byId(id)` |
| 3 | `recoverPendingJobs` 仅扫描 'Judging'/'Pending' 两种历史写法 | [lib/judge/worker.ts:276-322](file:///e:/桌面/dsoj/lib/judge/worker.ts#L276-L322) | 补全 'Running'/'RUNNING'，符合 Task 12.3 约束 |
| 4 | `enqueueAiGeneration` create + addAiJob 非事务 | [lib/ai/service/generation.ts:133-139](file:///e:/桌面/dsoj/lib/ai/service/generation.ts#L133-L139) | 调整顺序：先 addAiJob 再 create，或 worker.ts 兜底扫描 |
| 5 | `quality-check.ts` 硬下限 `test_cases.length < 8` | [lib/ai/quality-check.ts:498-500](file:///e:/桌面/dsoj/lib/ai/quality-check.ts#L498-L500) | 改为覆盖度维度评分（10 维覆盖度清单） |
| 6 | `batchUpdateUserRole` 仅调 `clearUserCache` 依赖内部链式 | [lib/user/admin.ts:257-266](file:///e:/桌面/dsoj/lib/user/admin.ts#L257-L266) | 显式调用 `clearAuthUserCache` 双保险 |
| 7 | 多处 `.catch(() => {})` 空 catch 块 | [lib/ai/queue/handlers/parametric.ts:391](file:///e:/桌面/dsoj/lib/ai/queue/handlers/parametric.ts#L391), test-data.ts:259,392,478 | 改为 `.catch((err) => logger.warn(...))` |
| 8 | `compiler.ts` cleanup 不清理 sourcePath | [lib/judge/compiler.ts:243-251](file:///e:/桌面/dsoj/lib/judge/compiler.ts#L243-L251) | 扩展 cleanup 签名同时删除 sourcePath |
| 9 | `lib/redis.ts` 未导出 closeClient | [lib/redis.ts](file:///e:/桌面/dsoj/lib/redis.ts) | 增加 `closeRedis()` 并在 server.ts SIGTERM 调用 |
| 10 | `lib/mongodb/client.ts` 未导出 closeClient | [lib/mongodb/client.ts](file:///e:/桌面/dsoj/lib/mongodb/client.ts) | 增加 `closeClient()` |
| 11 | 多个 setInterval 未集中清理 | lib/cache.ts:16, lib/judge/queue.ts:82, lib/judge/worker.ts:342,352 等 7+ 文件 | 引入 `lib/lifecycle.ts` 统一注册中心 |
| 12 | AI 队列用户级限流未持久化（多实例失效） | [lib/ai/queue/index.ts:90-105](file:///e:/桌面/dsoj/lib/ai/queue/index.ts#L90-L105) | 迁移到 Redis `INCR ai:ratelimit:${userId}` |
| 13 | `tests/env.test.ts` 失败（pre-existing） | [tests/env.test.ts](file:///e:/桌面/dsoj/tests/env.test.ts) | 模块重新加载导致 dotenv 重新注入 .env，需隔离测试环境 |
| 14 | `types/models.ts` Problem 类型缺字段 | [types/models.ts](file:///e:/桌面/dsoj/types/models.ts) | 补全 comparisonMode/realPrecision/stdCode 等 8 字段 |
| 15 | `ClassMember.role` 注释与 schema 不一致 | [types/models.ts:178](file:///e:/桌面/dsoj/types/models.ts#L178) | 统一 schema.prisma 注释 |
| 16 | `.env.example` 缺 TZ 环境变量 | [.env.example](file:///e:/桌面/dsoj/.env.example) | 添加 `TZ=Asia/Shanghai` |
| 17 | middleware 限流白名单错路径 | [middleware.ts:12-26](file:///e:/桌面/dsoj/middleware.ts#L12-L26) | 删除 `/api/comments`（无此路由），`/api/contests/join` 改为 `/api/contests/.*?/register` |
| 18 | 环境变量未集中校验 | [lib/env.ts](file:///e:/桌面/dsoj/lib/env.ts) | 仅校验 6 个核心变量，13+ 个变量直接 `process.env.*` 读取无校验 |

---

## 🔗 运行匹配验证

### 模块兼容性表

| 模块 | 前端→后端 | 后端→数据库 | 状态 |
|------|----------|-----------|------|
| 认证（Auth） | ✅ 5 API 全匹配 | ✅ User 表完整 | ✅ |
| 题目（Problem） | ✅ 8 API 全匹配 | ⚠️ types/models.ts 缺 8 字段 | ⚠️ |
| 提交（Submission） | ✅ 3 API 全匹配 | ✅ Submission 表完整 | ✅ |
| 竞赛（Contest） | ✅ 8 API 全匹配 | ✅ Contest 表完整 | ✅ |
| 班级（Class） | ✅ 22 API 全匹配 | ✅ 9 表完整 | ✅ |
| 训练（Training） | ✅ 8 API 全匹配 | ✅ 4 表完整 | ✅ |
| 用户（User） | ✅ 13 API 全匹配 | ✅ User 表完整 | ✅ |
| AI | ⚠️ 20 API，7 个零调用 | ✅ 5 表完整 | ⚠️ |
| 题解（Solution） | ✅ 5 API 全匹配 | ⚠️ 3 冗余字段 | ⚠️ |
| 管理后台（Admin） | ✅ 22 API 全匹配 | ✅ AuditLog 完整 | ✅ |
| 通知公告 | ✅ 6 API 全匹配 | ✅ 表完整 | ✅ |
| 评测（Judge） | ✅ 内部模块 | ✅ 无独立表 | ✅ |

---

### 关键不匹配项

> ⚠️ **AI 模块 7 个 API 零前端调用**：
> - `POST /api/admin/ai/preview-cleanup`（疑定时任务/手动触发）
> - `GET /api/admin/ai/solution/status`（功能可能合并到 logs）
> - `POST /api/admin/ai/generate/batch`（批量出题，前端未启用）
> - `POST /api/admin/problems/[id]/regenerate-solution`（deprecated 308）
> - `GET /api/ai/capabilities`（注释"预留接口"）
> - `GET /api/admin/problems/review`（审核流程未启用）
> - `GET /api/admin/problems/export`（CSV 导出，前端按钮可能已移除）

> ⚠️ **类型定义缺失字段**：`types/models.ts` 的 `Problem` 接口缺 `comparisonMode`/`realPrecision`/`stdCode`/`stdLang`/`expReward`/`coinReward`/`timeThresholds`/`verificationLogs` 共 8 字段

> ⚠️ **环境变量校验不集中**：`lib/env.ts` 仅校验 6 个核心变量，`USE_DOCKER`/`JUDGE_*`/`AI_*`/`LOG_LEVEL`/`NEXT_PUBLIC_*`/`TRUSTED_PROXIES`/`FORCE_SECURE_COOKIE`/`PORT`/`HOSTNAME`/`CSRF_SECRET`/`REDIS_URL` 共 13+ 个变量直接 `process.env.*` 读取无校验

> ⚠️ **限流白名单错路径**：`/api/comments`（无此路由，评论内联在题解路由）、`/api/contests/join`（实际为 `/api/contests/[id]/register`）

> ⚠️ **未启用数据模型**：`NoteReadHistory`（全代码库无引用）、`Blog`（User 关系存在但无服务层）、`Solution.codePython`（Task 26.5 已废弃）、9 个游戏化模型（Phase 1 预留）

---

### 测试覆盖缺口

| 缺口模块 | 文件路径 | 风险 | 严重度 |
|---------|---------|------|--------|
| 评测核心 | [lib/judge/judger.ts](file:///e:/桌面/dsoj/lib/judge/judger.ts), executor.ts, executor-core.ts, compiler.ts, docker.ts, queue.ts, worker.ts | 评测核心逻辑（沙箱、编译、执行、计时）无单元测试 | High |
| 提交服务 | [lib/submission/service.ts](file:///e:/桌面/dsoj/lib/submission/service.ts) | 提交 CRUD、评分计算、与评测队列交互无测试 | High |
| 班级业务 | [lib/class/](file:///e:/桌面/dsoj/lib/class) (17 文件) | 班级/作业/成员/笔记/邀请复杂业务无测试 | High |
| 竞赛业务 | [lib/contest/](file:///e:/桌面/dsoj/lib/contest) (10 文件) | 竞赛注册/排行/提交可见性无测试 | High |
| 鉴权服务 | [lib/auth/service.ts](file:///e:/桌面/dsoj/lib/auth/service.ts) | findUserByEmail/Username, verifyPassword, hashPassword 无测试 | Medium |
| CSRF 防护 | [lib/security/csrf.ts](file:///e:/桌面/dsoj/lib/security/csrf.ts) | CSRF token 生成/校验无测试 | Medium |
| 限流 | [lib/rate-limit.ts](file:///e:/桌面/dsoj/lib/rate-limit.ts) | 限流核心逻辑无测试 | Medium |
| 缓存 | [lib/cache.ts](file:///e:/桌面/dsoj/lib/cache.ts) | LRU 淘汰、singleflight、TTL 过期无测试 | Medium |
| AI 队列 | [lib/ai/queue/](file:///e:/桌面/dsoj/lib/ai/queue) | 任务队列、重试、超时、健康度更新无测试 | Medium |
| withApi 包装器 | [lib/api/handler.ts](file:///e:/桌面/dsoj/lib/api/handler.ts), withApi.ts | API 错误处理、权限校验、缓存无测试 | Medium |
| 题解权限 | [lib/solution/permissions.ts](file:///e:/桌面/dsoj/lib/solution/permissions.ts) | 题解查看/点赞去重无测试 | Medium |

---

## 🚀 优化评估建议

### P0 🚨 紧急修复

- **修复 canTransition 状态机 fail-open** — 影响: 状态机保护失效，未知状态转换默认放行
  - 修复步骤: 改 `return true` 为 `return false` + logger.warn；补充 SubmissionStatus 枚举遍历测试

- **统一 test-data.ts 与 parametric.ts 失败行为** — 影响: AI 生成测试用例缺失导致用户提交被误判 WA
  - 修复步骤: test-data.ts 的 `runSolutionValidation` 失败改为 throw FAILED，与 parametric.ts 对齐

- **batchUpdateUserRole 显式调用 assertAssignableRole** — 影响: lib 层权限校验缺失，被脚本调用可绕过
  - 修复步骤: 入参增加 `operatorRole`，循环内调用 `assertAssignableRole(item.role, operatorRole)`

### P1 🔴 高优先级

- **统一提交状态字段大小写** — 影响: 重现 Lessons Learned 中的 recover 路径失败
  - 修复步骤: 全部替换为 `SubmissionStatus.PENDING` 枚举常量

- **补充评测器单元测试** — 影响: 评测核心无防护，回归风险高
  - 修复步骤: 补充 compiler/executor-core/judger 三个测试文件，使用 vitest mock

- **删除 getUserFullInfo 死代码** — 影响: 误调用导致 password 哈希泄漏
  - 修复步骤: 直接删除函数

- **删除 ModelSelector deprecated 组件** — 影响: 新人误用
  - 修复步骤: 直接删除文件

- **删除 deprecated 路由** — 影响: 维护成本
  - 修复步骤: 删除 `app/api/admin/problems/[id]/regenerate-solution/route.ts`

### P2 🟡 中优先级

- **CSP 强化（移除 unsafe-inline）** — 影响: XSS 防护削弱
  - 修复步骤: 使用 nonce-based CSP（不引入新依赖）

- **开发环境 WebSocket CORS 收紧** — 影响: 开发环境公网暴露风险
  - 修复步骤: 改用具体 origin

- **命令拼接改 spawn 数组** — 影响: 模式不规范，未来扩展风险
  - 修复步骤: docker.ts/executor-core.ts/process-stats.ts 共 4 处改 spawnSync

- **IPv6 校验补充 mapped 地址** — 影响: SSRF 绕过
  - 修复步骤: fetch-safe.ts 补充 `::ffff:` 映射校验

- **统一 MongoDB 客户端** — 影响: 重复实现维护成本
  - 修复步骤: 迁移 avatar complete 路由，删除 lib/mongodb.ts

- **完成 validation.ts 迁移** — 影响: deprecated 模块残留
  - 修复步骤: 3 个引用方迁移到 lib/api/validation.ts，删除旧模块

- **补全 types/models.ts Problem 字段** — 影响: 前后端类型不匹配
  - 修复步骤: 补全 8 个缺失字段

- **环境变量集中校验** — 影响: 配置错误难以发现
  - 修复步骤: env.ts 补充 warn 级别存在性检查

- **补充班级/竞赛业务测试** — 影响: 复杂业务无防护
  - 修复步骤: 优先补测 assignment-submit、rankings

### P3 🟢 体验提升

- **迁移 fetchWithAuth → fetchWithCookie** — 影响: 67 文件 deprecated 别名
  - 修复步骤: 批量 sed 替换，删除别名

- **stderr 截断阈值统一** — 影响: 维护歧义
  - 修复步骤: 引入 `STDERR_TRUNCATE_LENGTH = 2000` 常量

- **空 catch 块加 logger.warn** — 影响: 排查困难
  - 修复步骤: 4 处 `.catch(() => {})` 改为 `.catch(err => logger.warn(...))`

- **Redis/MongoDB 客户端增加 close 方法** — 影响: 进程退出连接泄漏
  - 修复步骤: 增加 closeRedis/closeClient，server.ts SIGTERM 调用

- **setInterval 统一注册** — 影响: 僵尸进程风险
  - 修复步骤: 引入 lib/lifecycle.ts 统一注册中心

- **清理历史报告文件** — 影响: 项目根目录混乱
  - 修复步骤: 移到 docs/history/ 或删除

- **tsconfig/eslint 配置去重** — 影响: 配置冗余
  - 修复步骤: 删除重复 include，合并 ESLint 重复规则

- **删除未启用数据模型** — 影响: Schema 冗余
  - 修复步骤: 确认后删除 NoteReadHistory/Blog

- **.env.example 补 TZ** — 影响: 时区配置遗漏
  - 修复步骤: 添加 `TZ=Asia/Shanghai`

- **修正限流白名单路径** — 影响: 限流失效
  - 修复步骤: 删除 `/api/comments`，`/api/contests/join` 改为正则

---

## 📌 优化实施路线图

### 阶段 1: P0 紧急修复（建议本迭代）
- [ ] 修复 `canTransition` fail-open 为 fail-closed + 补枚举遍历测试 ([lib/constants/submission-status.ts:215](file:///e:/桌面/dsoj/lib/constants/submission-status.ts#L215))
- [ ] 统一 `test-data.ts` 失败行为为 throw FAILED ([lib/ai/queue/handlers/test-data.ts:104-118](file:///e:/桌面/dsoj/lib/ai/queue/handlers/test-data.ts#L104-L118))
- [ ] `batchUpdateUserRole` 显式调用 `assertAssignableRole` + `clearAuthUserCache` ([lib/user/admin.ts:257-266](file:///e:/桌面/dsoj/lib/user/admin.ts#L257-L266))

### 阶段 2: P1 高优先级（建议下个迭代）
- [ ] 统一提交状态字段为 `SubmissionStatus.PENDING` 枚举 ([lib/submission/service.ts:67,144](file:///e:/桌面/dsoj/lib/submission/service.ts#L67))
- [ ] 补充评测器单元测试（compiler/executor-core/judger） ([tests/judge/](file:///e:/桌面/dsoj/tests))
- [ ] 删除 `getUserFullInfo` 死代码 ([lib/user/service.ts:~1200](file:///e:/桌面/dsoj/lib/user/service.ts))
- [ ] 删除 `ModelSelector` deprecated 组件 ([components/ai/ModelSelector.tsx](file:///e:/桌面/dsoj/components/ai/ModelSelector.tsx))
- [ ] 删除 deprecated 路由 ([app/api/admin/problems/[id]/regenerate-solution/route.ts](file:///e:/桌面/dsoj/app/api/admin/problems/[id]/regenerate-solution/route.ts))
- [ ] `recoverPendingJobs` 补全 'Running'/'RUNNING' 状态扫描 ([lib/judge/worker.ts:276-322](file:///e:/桌面/dsoj/lib/judge/worker.ts#L276-L322))

### 阶段 3: P2 中优先级（建议季度内）
- [ ] CSP 强化：移除 `'unsafe-inline'`，改用 nonce-based CSP ([next.config.ts:30](file:///e:/桌面/dsoj/next.config.ts#L30))
- [ ] 开发环境 WebSocket CORS 改用具体 origin ([lib/websocket/server.ts:117](file:///e:/桌面/dsoj/lib/websocket/server.ts#L117))
- [ ] 4 处命令拼接改 spawn 数组 ([lib/judge/docker.ts:93](file:///e:/桌面/dsoj/lib/judge/docker.ts#L93), executor-core.ts:163,304,366, process-stats.ts:64)
- [ ] IPv6 校验补充 IPv4-mapped 地址 ([lib/ai/fetch-safe.ts:60-65](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts#L60-L65))
- [ ] 统一 MongoDB 客户端到 `lib/mongodb/client.ts`，删除 `lib/mongodb.ts`
- [ ] 完成 `lib/validation.ts` → `lib/api/validation.ts` 迁移，删除旧模块
- [ ] 补全 `types/models.ts` Problem 类型 8 个缺失字段
- [ ] `lib/env.ts` 补充 13+ 个环境变量 warn 级校验
- [ ] 补充班级/竞赛业务单元测试（assignment-submit、rankings 优先）
- [ ] `enqueueAiGeneration` 调整 create/addAiJob 顺序 + worker.ts 兜底扫描

### 阶段 4: P3 体验提升（建议半年内）
- [ ] 批量替换 `fetchWithAuth` → `fetchWithCookie`，删除别名（67 文件）
- [ ] stderr 截断阈值统一为 `STDERR_TRUNCATE_LENGTH = 2000` 常量
- [ ] 4 处空 catch 块加 `logger.warn`
- [ ] `lib/redis.ts` 增加 `closeRedis()`，`lib/mongodb/client.ts` 增加 `closeClient()`
- [ ] server.ts SIGTERM 钩子调用 Redis/MongoDB close
- [ ] 引入 `lib/lifecycle.ts` 统一 setInterval 注册中心
- [ ] 清理历史报告文件到 `docs/history/`
- [ ] tsconfig 删除重复 include，ESLint 合并重复规则
- [ ] 删除未启用数据模型（NoteReadHistory/Blog 确认后）
- [ ] `.env.example` 补 `TZ=Asia/Shanghai`
- [ ] 修正限流白名单路径（删除 `/api/comments`，`/api/contests/join` 改正则）
- [ ] AI 队列用户级限流迁移到 Redis
- [ ] `quality-check.ts` 移除 `< 8` 硬下限，改为覆盖度维度评分
- [ ] `compiler.ts` cleanup 扩展为同时删除 sourcePath
- [ ] 迁移 `submission/service.ts` 缓存键到 `CacheKeys` 统一封装

### 阶段 5: 长期规划
- [ ] AI 功能恢复决策：恢复 `AI_FEATURE_DISABLED = false` 或归档 AI 代码分支
- [ ] 多实例部署支持：Cache 适配 Redis-backed 或 Redis pub/sub 失效广播
- [ ] api.test.ts 集成 CI：新增 `.github/workflows/ci-integration.yml`
- [ ] 游戏化模块（Phase 2）启用决策：激活 9 个预留 model 或清理
- [ ] Solution 冗余字段（codePython/language/code）数据迁移后清理

---

## 📝 总结

DSOJ 项目整体工程质量较高，关键安全防护（SSRF、XSS、JWT、文件上传、数据库注入、认证授权）均已落实，项目约束（Hard Constraints）大部分得到严格遵守（如 Docker 沙箱、crypto.randomBytes、normalizeStatus、avoidDuplicateWith 排除、checkGeneratedProblem 同步签名等）。

### 关键发现

1. **安全水位良好（82/100）**：主要改进点为 CSP 含 `unsafe-inline`、开发环境 CORS `*`、4 处命令拼接模式、IPv6 校验遗漏，均可在不引入新依赖前提下修复

2. **逻辑问题集中（5 个 High）**：状态机 fail-open、AI handler 不一致、批量改角色权限校验缺失、状态字段大小写、评测器零测试——这些是当前最需关注的问题，可能导致用户提交误判、权限提升漏洞、状态机保护失效

3. **冗余可控（6 High + 19 Medium）**：主要死代码（getUserFullInfo/ModelSelector）、deprecated 模块（validation.ts/mongodb.ts/fetchWithAuth）、未启用 model（NoteReadHistory/Blog），均可渐进清理

4. **测试覆盖不足**：评测核心、班级、竞赛、AI 队列等关键模块零测试覆盖，是最大的工程风险

5. **AI 模块下线状态需文档化**：21 个组件 + 53+ lib 文件活跃但运行时不可达，建议明确恢复计划或归档

### 修复策略建议

- **不引入新技术**：所有 P0-P3 修复均基于现有技术栈（Next.js/Prisma/vitest），不增加新依赖
- **优先修复 5 个 High 逻辑问题**：这些直接影响用户体验和系统安全
- **分阶段渐进清理冗余**：deprecated 模块迁移需谨慎，避免影响生产
- **补充关键模块测试**：评测器、班级、竞赛是测试缺口优先级最高的三个模块
- **长期规划多实例支持**：当前 Cache/限流/AI 队列均为单实例实现，多实例部署前需迁移到 Redis

报告生成完毕。所有问题均附具体文件路径和行号，可直接定位修复。建议按路线图阶段 1→5 顺序执行，每个阶段完成后运行 `npm run typecheck && npm run lint && npm test` 验证。
