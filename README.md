# 大山OJ (Dashan OJ)

一个功能完整的在线编程平台 (Online Judge)，支持多语言代码提交、自动评测、实时反馈、班级协作、训练题单与竞赛等功能。

[![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green)](https://www.mongodb.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.17-blue)](https://www.prisma.io/)
[![Security](https://img.shields.io/badge/Security-Hardened-success)](#安全架构)

## 功能特性

### 核心功能

- **用户认证系统** — JWT + httpOnly Cookie 统一认证（token 不再落 localStorage），密码 bcrypt 加密，tokenVersion 吊销机制
- **题目管理** — 题目列表、详情展示（KaTeX 数学公式渲染）、统计分析、AI 辅助出题
- **题库筛选** — 内嵌搜索栏；难度下拉多选；标签弹窗多选（OR 匹配）
- **代码提交** — 支持 C++ (C++17)、C (C11)、Java (Java 17)、Python (Python 3.10)、JavaScript (Node.js 18)
- **自动评测** — 实时编译执行判定，WebSocket 推送评测进度，支持时间/内存限制
- **评测结果** — AC/WA/TLE/MLE/RE/CE 全状态支持，详细测试点结果

### 首页与公告

- **学习仪表盘** — 今日解题、连续打卡、本周通过率、Rating 等统计
- **系统公告** — 首页 6 列卡片展示，置顶与过期时间；详情页 `/announcements/[id]`；后台「运营管理 → 系统公告」

### 班级系统

- **班级管理** — 创建/加入班级，用户名直邀机制（邀请码已废除），成员角色权限（班主任/助教/学生）
- **班级作业** — 标签页式作业详情，题目切换与代码编辑提交一体
- **作业三态模型** — `upcoming`（未开始）/ `active`（进行中）/ `ended`（已结束）统一判定，前后端一致；`allowLateSubmission` 开关控制 ended 状态是否仍接受逾期提交
- **作业计时** — 作业维度首次 AC 触发 `finalizeTiming`，记录每题做题用时（`timeElapsedMs`）；与全局题库 AC 解耦（`isFirstAcInAssignment` vs `isFirstAcGlobal`）
- **完成度追踪** — 学生完成情况矩阵（AC 显示"用时 mm:ss 通过"）、总用时列（可排序）、平均用时统计；提交记录与代码查看
- **状态守卫** — 未开始/已结束（不允许逾期）时提交按钮禁用，ProblemTimer 作业结束后不启动
- **笔记系统** — 班级知识库
- **班级排行榜** — 基于解题与表现的班级内排名（非积分商城）

### 列表与导航（卡片布局）

- 竞赛、训练题单、班级列表、首页「近期作业 / 即将开始竞赛 / 系统公告」等大屏均为 **6 列卡片网格**（`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`）

### 其他功能

- **竞赛模式** — ACM/OI 赛制，实时榜单，赛题管理
- **训练题单** — 官方 / 竞赛真题 / 我的收藏分类（个人创建已移除，仅管理员可创建）
- **社区讨论** — 题解评论、帖子发布
- **AI 工作台** — 4 大功能 tab（智能出题 / 题目分析 / 元数据建议 / 测试数据生成）；AI 任务队列（拆分为 service/queue 多文件架构）；难度系统统一为洛谷 8 级标准（入门/普及-/普及/普及+/提高/提高+/省选/NOI）
- **响应式设计** — 移动端 Drawer 抽屉菜单适配
- **Docker 部署** — 一键部署，MongoDB 副本集 + Redis 缓存 + Nginx 反代

> **说明**：班级积分账户、积分商城、积分流水及邀请码机制已移除；历史 MongoDB 集合需自行清理（见更新日志）。

## 快速开始

### 环境要求

- Node.js 20+
- MongoDB 7+ (Replica Set 模式)
- Redis 7+ (可选，用于队列)
- g++/gcc（C/C++ 编译器）

### 安装步骤

```bash
# 克隆项目
git clone https://gitee.com/carefree-old-man/dashan-oj.git
cd dashan-oj

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 初始化数据库（含 SystemAnnouncement 等新模型）
npx prisma db push
npx prisma generate

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 环境变量

```env
# 必需
DATABASE_URL=mongodb://localhost:27017/dashan-oj
JWT_SECRET=your-secret-key-at-least-32-chars
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3000

# 可选（评测/AI 队列）
REDIS_URL=redis://localhost:6379

# 可选（AI 配置加密；未配置时降级为不加密，仅开发环境允许）
AI_CONFIG_ENCRYPTION_KEY=your-32-char-hex-key
```

> ⚠️ **重要**：本项目**无任何默认账户**（包括管理员/测试用户）。
> 部署后首个通过 `/api/auth/register` 注册的用户将自动成为 `SYSTEM_ADMIN`，
> 可在后台管理题目、竞赛、班级等。
> 详见 `app/api/auth/register/route.ts` 的 `isFirstUser` 判定逻辑。

> ⚠️ **生产环境强制要求**：必须设置 `JWT_SECRET`（≥32 字符）与 `USE_DOCKER=true`（评测沙箱）。Windows 开发环境下若未启用 Docker，评测机会在启动时输出安全告警但仍可运行（仅供开发）。

## Docker 部署

```bash
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET
docker-compose up -d --build
docker-compose logs -f app
```

| 服务  | 端口   | 说明             |
| ----- | ------ | ---------------- |
| app   | 3000   | Next.js 应用     |
| mongo | 27017  | MongoDB (副本集) |
| redis | 6379   | Redis 缓存       |
| nginx | 80/443 | 反向代理         |

## 技术架构

### 前端

- **框架**: Next.js 16 App Router + React 19
- **语言**: TypeScript（严格模式，无 `as any` 类型绕过）
- **样式**: Tailwind CSS
- **状态管理**: React Context (UserContext / SettingsContext) + SWR 数据缓存
- **通信**: WebSocket (Socket.IO) 实时评测推送，cookie 自动携带鉴权

### 后端

- **API**: Next.js API Routes，`withApi` 统一封装鉴权 + JSON 解析 + 异常处理（5 种模式：public / auth / admin / systemAdmin / class）
- **数据库**: MongoDB Replica Set + Prisma ORM（38 个模型）
- **认证**: JWT + httpOnly Cookie 统一模式（token 不再落 localStorage），tokenVersion 吊销机制
- **缓存**: 分层缓存 — `lib/api/handler.ts` 进程级用户缓存（60s TTL，鉴权层）/ `lib/cache.ts` 业务层缓存
- **安全**: 4 级 RBAC 权限、SSRF 防护、魔数校验上传、execSync 命令注入防护、CSRF + 限流中间件

### 评测系统

- 内存队列 (EventEmitter) / BullMQ（可选）
- Docker 沙箱隔离编译执行（生产强制；Windows 开发环境告警降级）
- 输出比对 + 时间/内存检查
- 静态危险模式告警（最终安全边界由沙箱决定）

## 安全架构

本项目经过完整的安全加固流程，覆盖 P0-P3 全部 20 项优化项。

### 角色体系（4 级）

| 角色       | 标识           | 权限                                 |
| ---------- | -------------- | ------------------------------------ |
| 系统管理员 | `SYSTEM_ADMIN` | 全部权限，唯一可分配 `ADMIN` 的角色  |
| 管理员     | `ADMIN`        | 内容与用户管理，不可管理其他 `ADMIN` |
| 教师       | `TEACHER`      | 出题、建班、建赛                     |
| 学生       | `STUDENT`      | 默认角色，答题与参与                 |

> 角色判断统一使用 `canAccessAdmin(user)` / `canManageContent(user)`（见 `lib/permissions.ts`），禁止直接 `isAdmin(user)` 比较。

### 关键安全措施

- **JWT 安全** — httpOnly + Secure + SameSite Cookie，tokenVersion 吊销，payload 仅含 userId/email/username/role
- **SSRF 防护** — `validateAiBaseUrl()` 阻止 AI 服务商 baseUrl 指向内网/元数据端点（`lib/ai/providers.ts`）
- **文件上传** — `detectImageMime()` 魔数校验（JPEG/PNG/GIF/WebP），拒绝伪造扩展名（`lib/upload.ts`）
- **命令注入防护** — `execSync` 调用前对 pid 做 `Number.isFinite` 校验（`lib/judge/executor.ts`）
- **加密安全** — 安全关键随机值使用 `crypto.randomBytes`（题目编号、临时密码等），禁用 `Math.random`
- **权限白名单** — 班级成员权限更新走 `ALLOWED_PERMISSION_KEYS` 过滤（`lib/class/service.ts`）
- **事务原子性** — AI 服务关键操作用 `prisma.$transaction` 包裹
- **类型安全** — 85 处 `(ctx as any).params` 已全部清理为类型安全的 `ctx.params`

## 项目结构

```
dashan-oj/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由（100 个 route.ts，150 个方法）
│   │   ├── admin/                # 管理后台 API（含 ai/classes/contests/problems/users）
│   │   ├── auth/                 # 认证（login/logout/register/me/forgot-password）
│   │   ├── classes/[id]/         # 班级（成员/作业/笔记/题目/直邀）
│   │   ├── problems/             # 题目列表与详情
│   │   ├── submissions/          # 提交与评测
│   │   ├── contests/             # 竞赛
│   │   ├── trainings/            # 训练题单
│   │   ├── solutions/            # 题解
│   │   ├── home/dashboard        # 登录用户首页聚合
│   │   └── notifications/        # 通知
│   ├── admin/                    # 管理后台页面
│   ├── classes/[id]/             # 班级工作区
│   ├── problems/、contests/、training/  # 列表与详情页
│   └── profile/、settings/       # 用户中心
├── components/
│   ├── common/                   # EducationalPageShell、MarkdownRenderer 等
│   ├── class/、contest/、training/、problem/、solution/
│   └── admin/                    # 后台组件
├── lib/
│   ├── api/                      # withApi（统一封装）、handler（鉴权缓存）、response、validation
│   ├── auth/                     # 认证服务（JWT、httpOnly Cookie、tokenVersion）
│   ├── permissions.ts            # 4 级角色权限单一来源（canAccessAdmin 等）
│   ├── ai/                       # AI 出题/题解/模型发现（含 SSRF 防护）
│   ├── judge/                    # 评测机（Docker 沙箱 + Windows 告警）
│   ├── class/、problem/、submission/、contest/、training/、solution/
│   ├── cache.ts                  # 业务层缓存
│   ├── crypto.ts                 # AI 配置加密
│   ├── upload.ts                 # 文件上传 + 魔数校验
│   └── prisma.ts
├── prisma/schema.prisma          # 38 个模型；已移除 Points* 与 ClassInvite
├── hooks/、contexts/             # UserContext、SettingsContext、SWR Provider
├── tests/                        # vitest 测试（91 用例）
├── scripts/                      # 部署与维护脚本
└── summary-report.html           # 项目审查报告（交互式 HTML）
```

### 业务层调用链

```
Route → withApi.auth / withApi.public / withApi.admin / withApi.class
       → 鉴权（getCachedUser + tokenVersion 校验）
       → lib/<domain>/service.ts → prisma
                                  ↓
                          lib/cache.ts (TTL 缓存)
```

### 缓存分层

- **鉴权层** — `lib/api/handler.ts` 的 `userCache` Map（60s TTL，LRU 10000 条），仅缓存 role/tokenVersion
- **业务层** — `lib/cache.ts`（基于内存 + 可选 Redis），缓存题目、竞赛、用户统计等
- **清理入口** — `lib/user/service.ts` 的 `clearUserCache` 统一调用 `clearAuthUserCache`（鉴权层）+ 业务缓存

## 更新日志

### 2026/07（班级作业审查优化 + AI 工作台重构 + UI 规范化）

- **班级作业三态模型** — 统一 `upcoming`/`active`/`ended` 状态判定（`getAssignmentStatus`），前后端一致；`allowLateSubmission` 字段控制 ended 状态是否接受逾期提交
- **作业计时解耦** — `isFirstAcInAssignment`（查 `ClassAssignmentSubmission` 表）替代 `isFirstAcGlobal` 触发 `finalizeTiming`；学生先在题库 AC 后在作业中 AC 仍可正确记录用时
- **状态机修复** — `PENDING`/`JUDGING`/`RUNNING` → 任意状态（含 `AC`）的 recover 路径，归一化后比较兼容历史大驼峰写法
- **用时统计** — 提交弹窗 AC 时展示"做题用时"指标卡；完成情况统计表 AC 显示"用时 mm:ss 通过"、新增"总用时"列（可排序）与平均用时
- **作业级联清理** — `deleteClassAssignmentDirect` 事务清理 `ClassAssignmentProblemProgress` / `ClassAssignmentProblem` / `AssignmentCompletionRewardLog`，并置空 `Submission.assignmentSubmissionId`
- **isLate 自动重算** — 修改 `endTime` 后自动调用 `recalculateLateFlags` 重算所有提交的 isLate 标记
- **API 守卫** — 提交频率限制（10s/429）、语言白名单（cpp/c/python）、代码长度校验、`/submissions` 权限漏洞修复（非管理员强制 userId=self）
- **前端状态守卫** — 未开始/已结束（不允许逾期）时提交按钮禁用 + 状态横幅；ProblemTimer `assignmentEndedRef` 边界控制
- **AI 工作台重构** — `lib/ai/service.ts` 拆分为 8 个文件、`lib/ai/queue.ts` 拆分为 10 个文件；新增 4 个功能 tab（智能出题/题目分析/元数据建议/测试数据生成）与 `AiTaskResultViewer` 轮询组件
- **难度系统统一** — 全站对齐洛谷 8 级标准（入门/普及-/普及/普及+/提高/提高+/省选/NOI），`getDifficultyColor` 单一来源
- **题单功能调整** — 移除个人题单创建（仅管理员可创建），恢复"我的收藏"分类（`joinedOnly` 过滤）
- **后台 UI 规范化** — 移除重复页面标题（H1）；统一操作工具栏（左描述右按钮）；FilterBar 合并搜索框与操作按钮
- **REMOVED 提交状态** — 作业移除题目时孤儿提交标记为 `removed`（终态，不再计入统计但保留记录）
- **stale 任务重置** — 服务启动时 `resetStaleTasksOnStartup` 将遗留 PENDING/PROCESSING 任务标记为 FAILED

### 2026/07（安全加固与冗余清理）

- **邀请码废除** — 移除 `ClassInvite` 模型与全部邀请码相关 API/页面，班级加入改用用户名直邀
- **认证统一** — JWT token 全部走 httpOnly Cookie，前端不再读写 localStorage；`UserContext`、`useSubmissionSocket`、批量注册 XHR 等全部清理
- **4 级角色体系** — 标准化为 `SYSTEM_ADMIN` / `ADMIN` / `TEACHER` / `STUDENT`；`lib/permissions.ts` 为单一来源；9 个路由文件的 `isAdmin(user)` 改为 `canAccessAdmin(user)`
- **SSRF 防护** — `validateAiBaseUrl()` 阻止 AI 服务商 baseUrl 指向内网/元数据端点（IPv4 私有段、IPv6 内网、localhost、非 http(s) 协议）
- **文件上传安全** — `detectImageMime()` 魔数校验（JPEG/PNG/GIF/WebP），拒绝伪造扩展名
- **命令注入防护** — `execSync` 调用前对 pid 做 `Number.isFinite` 校验
- **加密安全** — 题目编号、临时密码等安全关键随机值改用 `crypto.randomBytes`
- **缓存一致性** — `clearUserCache` 统一入口联动 `clearAuthUserCache`，修复角色变更后鉴权缓存未清除的问题
- **类型安全** — 85 处 `(ctx as any).params` 类型绕过全部清理为类型安全的 `ctx.params`
- **死代码清理** — `lib/api/handler.ts` 移除 `withAuth`/`withClassRole`/`withAdmin`/`parseJson`/`parseQuery` 等已被 `withApi` 取代的旧 API，精简至 90 行
- **命名冲突解决** — `clearUserCache` 重命名为 `clearAuthUserCache`（鉴权层）vs `clearUserCache`（业务层统一入口），职责分离
- **组件去重** — 合并重复的 `MarkdownRenderer` 组件到 `components/common/`
- **默认角色修正** — fallback 值从无效的 `'user'` 改为 `'STUDENT'`
- **审计日志** — `contest-auth` 审计日志从 `JSON.stringify` 改为对象直传
- **测试改进** — 测试凭据从硬编码改为环境变量；API Key 前缀打印从 8 字符减至 4 字符

### 2026/06（近期）

- **系统公告**：`SystemAnnouncement` 模型；公开 API + 后台 CRUD；首页与 `/announcements` 6 列卡片 + 详情页
- **首页仪表盘**：移除「推荐训练」「继续学习」「班级动态」；近期作业 / 即将竞赛 / 公告均为 6 列布局
- **列表页卡片化**：竞赛、训练题单、班级列表改为 6 列卡片网格
- **题库筛选**：难度下拉多选、标签弹窗多选；搜索与筛选项单行内嵌；移除排序筛选
- **移除班级积分**：删除 `lib/points`、`PointsAccount` / `PointsHistory` / `PointsShopItem` / `PointsExchange` 及班级积分页面与 API；`ClassWorkspaceShell` 去掉积分导航
- **成员活动**：`getClassMemberActivity` 不再包含积分流水与 `totalPoints`

### 2026/06（架构）

- **API 中间件**：`lib/api/withApi.ts`、`withPermission`；统一 `ok()` / 错误码
- **业务层抽离**：auth / user / contest / problem / submission / notification / class / training 等
- **团队 → 班级重构**：模型与路由统一为 Class；`scripts/migrate-team-to-class.ts`
- **稳定性**：错误边界、logger、Prisma 调用收敛至 service 层

### 2026/05

- 作业详情页标签页 + 字母切换式布局；完成情况矩阵与提交记录弹窗
- 导航栏移动端 Drawer；KaTeX 修复；`fetchWithAuth` 统一封装

### 2026/02

- Docker 部署；MongoDB 副本集；WebSocket 评测推送；安全头与 XSS 防护

## 许可证

MIT License
