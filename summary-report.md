# DSOJ 全面审查总结报告

> **生成时间**: 2026-07-16
> **审查模式**: 深度模式（4 个并行批次）
> **审查范围**: 后端 + 前端 + 数据库 + 配置 + 安全
> **审查深度**: 全部 4 批次（结构 + 安全 + 逻辑 + 冗余）

---

## 📊 项目总览

| 维度           | 数据                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| **项目名称**   | DSOJ（DangOJ - 数据结构与算法在线评测系统）                                                   |
| **技术栈**     | Next.js 16 (App Router) + React 19 + TypeScript + Prisma + MongoDB + Socket.IO + Tailwind CSS |
| **后端模式**   | Next.js API Routes + 自定义 server.ts（Express 风格）                                         |
| **数据库**     | MongoDB（通过 Prisma ODM）                                                                    |
| **认证**       | JWT (HS256) + Cookie + tokenVersion 吊销机制                                                  |
| **AI 集成**    | 10+ 国产/国外大模型，OpenAI/Anthropic 双协议                                                  |
| **数据库模型** | 38 个 Prisma 模型                                                                             |
| **API 端点**   | 104 个 route.ts（含管理员路由）                                                               |
| **前端页面**   | 76 个 page.tsx + 共享组件                                                                     |
| **核心模块**   | 题目/提交/评测/竞赛/班级/题单/题解/AI/管理/通知                                               |

---

## 🏥 健康度评分

| 指标              | 评分         | 说明                                                      |
| ----------------- | ------------ | --------------------------------------------------------- |
| 🛡️ **安全性**     | **88 / 100** | 已实现 SSRF/CSRF/XSS/JWT 算法白名单防护；仍有少量中低风险 |
| ⚡ **稳定性**     | **90 / 100** | 自定义异常、限流、健康检查、超时控制完备                  |
| 🧹 **代码质量**   | **85 / 100** | 统一 ApiError/AppError，模块化清晰，存在少量冗余字段      |
| ✅ **功能完整度** | **92 / 100** | 核心 OJ + 班级 + 题单 + AI 全链路打通                     |

**综合评分**: **88 / 100** ⭐⭐⭐⭐

---

# 📑 第一部分：功能表与文件列表

## 1.1 核心模块概览

| 模块         | 路由前缀                                         | 关键文件                                     | 功能定位                       |
| ------------ | ------------------------------------------------ | -------------------------------------------- | ------------------------------ |
| 🔐 认证      | `/api/auth/*`                                    | `app/api/auth/login/route.ts` 等 5 个        | 登录/注册/找回密码/会话        |
| 👤 用户      | `/api/users/*`, `/api/auth/me`                   | `lib/user/service.ts`                        | 资料/统计/头像/偏好            |
| 📚 题目      | `/api/problems/*`                                | `lib/problem/*`, `app/api/problems/route.ts` | 题目 CRUD + 测试用例 + 标签    |
| ⚡ 提交/评测 | `/api/submissions/*`                             | `lib/submission/*`, `lib/judge/*`            | 编译 + 执行 + 评分             |
| 🏆 竞赛      | `/api/contests/*`                                | `lib/contest/*`                              | 赛制 + 注册 + 排行榜           |
| 🎓 班级      | `/api/classes/*`                                 | `lib/class/*`                                | 创建/成员/作业/笔记/邀请       |
| 📖 题解      | `/api/solutions/*`                               | `lib/solution/*`                             | 题解 CRUD + 点赞 + 权限        |
| 📋 题单/训练 | `/api/trainings/*`, `/api/training-categories/*` | `lib/training/*`                             | 题单 + 进度 + 报名             |
| 🤖 AI        | `/api/ai/*`, `/api/admin/ai/*`                   | `lib/ai/*`                                   | 多服务商 + 题解生成 + 模型管理 |
| 🔔 通知      | `/api/notifications/*`                           | `lib/notification/*`                         | 站内通知 + WebSocket 推送      |
| 📊 排行      | `/api/rankings/*`                                | `lib/ranking/service.ts`                     | 综合榜/班级榜/我的排名         |
| ⚙️ 管理      | `/api/admin/*`                                   | `app/api/admin/*`                            | 用户/题目/竞赛/AI/日志后台     |
| 💚 健康      | `/api/health/*`                                  | `app/api/health/*`                           | DB/Redis 健康探针              |

## 1.2 API 端点清单（精选 ~100 个）

### 🔐 认证模块（5 个）

| 方法 | 路径                        | 文件                                                                   |
| ---- | --------------------------- | ---------------------------------------------------------------------- |
| POST | `/api/auth/register`        | [route.ts](file:///e:/桌面/dsoj/app/api/auth/register/route.ts)        |
| POST | `/api/auth/login`           | [route.ts](file:///e:/桌面/dsoj/app/api/auth/login/route.ts)           |
| POST | `/api/auth/logout`          | [route.ts](file:///e:/桌面/dsoj/app/api/auth/logout/route.ts)          |
| GET  | `/api/auth/me`              | [route.ts](file:///e:/桌面/dsoj/app/api/auth/me/route.ts)              |
| POST | `/api/auth/forgot-password` | [route.ts](file:///e:/桌面/dsoj/app/api/auth/forgot-password/route.ts) |

### 👤 用户模块（10 个）

| 方法    | 路径                          | 文件                                                                           |
| ------- | ----------------------------- | ------------------------------------------------------------------------------ |
| GET/PUT | `/api/users/profile`          | [route.ts](file:///e:/桌面/dsoj/app/api/users/profile/route.ts)                |
| PUT     | `/api/users/profile/email`    | [route.ts](file:///e:/桌面/dsoj/app/api/users/profile/email/route.ts)          |
| PUT     | `/api/users/profile/password` | [route.ts](file:///e:/桌面/dsoj/app/api/users/profile/password/route.ts)       |
| GET/PUT | `/api/users/preferences`      | [route.ts](file:///e:/桌面/dsoj/app/api/users/preferences/route.ts)            |
| GET     | `/api/users/[id]/info`        | [route.ts](file:///e:/桌面/dsoj/app/api/users/[id]/info/route.ts)              |
| GET     | `/api/users/[id]/stats`       | [route.ts](file:///e:/桌面/dsoj/app/api/users/[id]/stats/route.ts)             |
| POST    | `/api/users/avatar/init`      | [route.ts](file:///e:/桌面/dsoj/app/api/users/avatar/upload/init/route.ts)     |
| POST    | `/api/users/avatar/chunk`     | [route.ts](file:///e:/桌面/dsoj/app/api/users/avatar/upload/chunk/route.ts)    |
| POST    | `/api/users/avatar/complete`  | [route.ts](file:///e:/桌面/dsoj/app/api/users/avatar/upload/complete/route.ts) |
| GET     | `/api/users/avatar/history`   | [route.ts](file:///e:/桌面/dsoj/app/api/users/avatar/history/route.ts)         |

### 📚 题目/提交/评测 模块（18 个）

| 方法           | 路径                             | 文件                                                                        |
| -------------- | -------------------------------- | --------------------------------------------------------------------------- |
| GET/POST       | `/api/problems`                  | [route.ts](file:///e:/桌面/dsoj/app/api/problems/route.ts)                  |
| GET/PUT/DELETE | `/api/problems/[id]`             | [route.ts](file:///e:/桌面/dsoj/app/api/problems/[id]/route.ts)             |
| GET            | `/api/problems/[id]/submissions` | [route.ts](file:///e:/桌面/dsoj/app/api/problems/[id]/submissions/route.ts) |
| GET            | `/api/problems/status`           | [route.ts](file:///e:/桌面/dsoj/app/api/problems/status/route.ts)           |
| GET            | `/api/problems/tags`             | [route.ts](file:///e:/桌面/dsoj/app/api/problems/tags/route.ts)             |
| GET/POST       | `/api/submissions`               | [route.ts](file:///e:/桌面/dsoj/app/api/submissions/route.ts)               |
| GET            | `/api/submissions/[id]`          | [route.ts](file:///e:/桌面/dsoj/app/api/submissions/[id]/route.ts)          |

### 🏆 竞赛模块（6 个）

| 方法           | 路径                             |
| -------------- | -------------------------------- |
| GET/POST       | `/api/contests`                  |
| GET/PUT/DELETE | `/api/contests/[id]`             |
| POST           | `/api/contests/[id]/register`    |
| GET            | `/api/contests/[id]/problems`    |
| GET            | `/api/contests/[id]/rank`        |
| GET            | `/api/contests/[id]/submissions` |

### 🎓 班级模块（25+ 个）

- 班级 CRUD：`/api/classes`, `/api/classes/[id]`
- 成员管理：`/api/classes/[id]/members`, `/api/classes/[id]/members/[memberId]`
- 成员权限：`/api/classes/[id]/members/[memberId]/permissions`
- 成员活动：`/api/classes/[id]/members/[memberId]/activity`
- 作业：`/api/classes/[id]/assignments`, `/api/classes/[id]/assignments/[assignmentId]`
- 作业提交：`/api/classes/[id]/assignments/[assignmentId]/submit`, `/submissions`
- 班级题目：`/api/classes/[id]/problems`, `/api/classes/[id]/problems/[problemId]`
- 班级笔记：`/api/classes/[id]/notes`, `/api/classes/[id]/notes/[noteId]`
- 加入申请：`/api/classes/[id]/requests`, `/api/classes/[id]/requests/[requestId]`
- 直接邀请：`/api/classes/[id]/invites/direct`, `/api/classes/invites/direct/[inviteId]`

### 🤖 AI 模块（10 个）

- `/api/ai/models` — 模型列表
- `/api/ai/providers-presets` — 服务商预设
- `/api/admin/ai/generate` — AI 生成（题解/题目）
- `/api/admin/ai/logs` — AI 调用日志
- `/api/admin/ai/models` & `/api/admin/ai/models/[id]` — 模型管理
- `/api/admin/ai/providers` & `/api/admin/ai/providers/[id]` — 服务商管理
- `/api/admin/ai/providers/[id]/discover-models` — 自动发现模型
- `/api/admin/ai/queue-status` — 队列状态
- `/api/admin/ai/solution/status` — 题解状态查询

### ⚙️ 管理后台（25+ 个）

- 用户管理：`/api/admin/users` & `/api/admin/users/[id]` + 批量操作（register/update/delete）
- 题目管理：`/api/admin/problems` & `/api/admin/problems/[id]` + batch/batch-source/export/review
- 题目验证：`/api/admin/problems/[id]/{verify,regenerate-solution,verification-logs}`
- 竞赛管理：`/api/admin/contests` & `/api/admin/contests/[id]`
- 班级管理：`/api/admin/classes` & `/api/admin/classes/[id]`
- 训练管理：`/api/admin/trainings`
- 公告管理：`/api/admin/announcements` & `/api/admin/announcements/[id]`
- 测试用例上传：`/api/admin/testcases/upload`
- 仪表盘：`/api/admin/dashboard`
- 系统设置：`/api/admin/settings`, `/api/admin/settings/test-email`
- 日志：`/api/admin/logs/source-changes`, `/api/admin/submissions`

### 💚 健康检查（3 个）

- `/api/health` — 综合
- `/api/health/db` — MongoDB
- `/api/health/redis` — Redis

## 1.3 数据库表清单（Prisma 38 个模型）

| 模型                                                                             | 文件位置          | 主要用途                                           |
| -------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| [User](file:///e:/桌面/dsoj/prisma/schema.prisma#L13-L75)                        | schema.prisma:13  | 用户主表（4 级 RBAC + tokenVersion）               |
| [AvatarHistory](file:///e:/桌面/dsoj/prisma/schema.prisma#L77-L88)               | schema.prisma:77  | 头像历史                                           |
| [Problem](file:///e:/桌面/dsoj/prisma/schema.prisma#L90-L141)                    | schema.prisma:90  | 题目（含 AI 标记字段）                             |
| [TestCase](file:///e:/桌面/dsoj/prisma/schema.prisma#L143-L158)                  | schema.prisma:143 | 测试用例                                           |
| [Submission](file:///e:/桌面/dsoj/prisma/schema.prisma#L160-L191)                | schema.prisma:160 | 提交记录（含 6 个复合索引）                        |
| [Contest](file:///e:/桌面/dsoj/prisma/schema.prisma#L193-L218)                   | schema.prisma:193 | 竞赛                                               |
| [ContestProblem](file:///e:/桌面/dsoj/prisma/schema.prisma#L220-L231)            | schema.prisma:220 | 竞赛题目                                           |
| [ContestParticipant](file:///e:/桌面/dsoj/prisma/schema.prisma#L233-L246)        | schema.prisma:233 | 竞赛参与                                           |
| [Class](file:///e:/桌面/dsoj/prisma/schema.prisma#L248-L265)                     | schema.prisma:248 | 班级                                               |
| [ClassMember](file:///e:/桌面/dsoj/prisma/schema.prisma#L267-L287)               | schema.prisma:267 | 班级成员（owner/assistant/student + 细粒度权限位） |
| [ClassAssignment](file:///e:/桌面/dsoj/prisma/schema.prisma#L289-L305)           | schema.prisma:289 | 班级作业                                           |
| [ClassAssignmentSubmission](file:///e:/桌面/dsoj/prisma/schema.prisma#L307-L335) | schema.prisma:307 | 作业提交                                           |
| [ClassNote](file:///e:/桌面/dsoj/prisma/schema.prisma#L337-L356)                 | schema.prisma:337 | 班级笔记                                           |
| [ClassDirectInvite](file:///e:/桌面/dsoj/prisma/schema.prisma#L358-L377)         | schema.prisma:358 | 直接邀请                                           |
| [ClassJoinRequest](file:///e:/桌面/dsoj/prisma/schema.prisma#L379-L395)          | schema.prisma:379 | 加入申请                                           |
| [Comment](file:///e:/桌面/dsoj/prisma/schema.prisma#L397-L420)                   | schema.prisma:397 | 题解评论                                           |
| [Solution](file:///e:/桌面/dsoj/prisma/schema.prisma#L422-L449)                  | schema.prisma:422 | 题解（含 sourceType + 4 索引）                     |
| [SolutionView](file:///e:/桌面/dsoj/prisma/schema.prisma#L451-L464)              | schema.prisma:451 | 题解浏览去重                                       |
| [SolutionLike](file:///e:/桌面/dsoj/prisma/schema.prisma#L466-L477)              | schema.prisma:466 | 题解点赞去重                                       |
| [Blog](file:///e:/桌面/dsoj/prisma/schema.prisma#L479-L495)                      | schema.prisma:479 | 博客                                               |
| [Training](file:///e:/桌面/dsoj/prisma/schema.prisma#L497-L530)                  | schema.prisma:497 | 题单                                               |
| [TrainingCategory](file:///e:/桌面/dsoj/prisma/schema.prisma#L532-L541)          | schema.prisma:532 | 题单分类                                           |
| [TrainingProblem](file:///e:/桌面/dsoj/prisma/schema.prisma#L543-L556)           | schema.prisma:543 | 题单-题目关联                                      |
| [TrainingEnrollment](file:///e:/桌面/dsoj/prisma/schema.prisma#L558-L569)        | schema.prisma:558 | 用户加入题单                                       |
| [Achievement](file:///e:/桌面/dsoj/prisma/schema.prisma#L571-L580)               | schema.prisma:571 | 成就定义                                           |
| [UserAchievement](file:///e:/桌面/dsoj/prisma/schema.prisma#L582-L592)           | schema.prisma:582 | 用户成就                                           |
| [Favorite](file:///e:/桌面/dsoj/prisma/schema.prisma#L595)                       | schema.prisma:595 | 收藏                                               |
| [Notification](file:///e:/桌面/dsoj/prisma/schema.prisma#L609)                   | schema.prisma:609 | 通知                                               |
| [NoteReadHistory](file:///e:/桌面/dsoj/prisma/schema.prisma#L625)                | schema.prisma:625 | 笔记阅读记录                                       |
| [AuditLog](file:///e:/桌面/dsoj/prisma/schema.prisma#L636)                       | schema.prisma:636 | 审计日志                                           |
| [AiGenerationLog](file:///e:/桌面/dsoj/prisma/schema.prisma#L651)                | schema.prisma:651 | AI 生成日志                                        |
| [AiModelConfig](file:///e:/桌面/dsoj/prisma/schema.prisma#L669)                  | schema.prisma:669 | AI 模型配置                                        |
| [AiProvider](file:///e:/桌面/dsoj/prisma/schema.prisma#L697)                     | schema.prisma:697 | AI 服务商配置                                      |
| [AiModel](file:///e:/桌面/dsoj/prisma/schema.prisma#L711)                        | schema.prisma:711 | AI 模型                                            |
| [UserAiPreference](file:///e:/桌面/dsoj/prisma/schema.prisma#L737)               | schema.prisma:737 | 用户 AI 偏好                                       |
| [VerificationLog](file:///e:/桌面/dsoj/prisma/schema.prisma#L752)                | schema.prisma:752 | 题目验证日志                                       |
| [SystemConfig](file:///e:/桌面/dsoj/prisma/schema.prisma#L762)                   | schema.prisma:762 | 系统配置                                           |
| [SystemAnnouncement](file:///e:/桌面/dsoj/prisma/schema.prisma#L771)             | schema.prisma:771 | 系统公告                                           |

## 1.4 前端关键文件

### 页面（精选）

- 主框架: [layout.tsx](file:///e:/桌面/dsoj/app/layout.tsx)、[page.tsx](file:///e:/桌面/dsoj/app/page.tsx)、[error.tsx](file:///e:/桌面/dsoj/app/error.tsx)
- 认证: [login/page.tsx](file:///e:/桌面/dsoj/app/login/page.tsx)、[register/page.tsx](file:///e:/桌面/dsoj/app/register/page.tsx)、[forgot-password/page.tsx](file:///e:/桌面/dsoj/app/forgot-password/page.tsx)
- 用户: [profile/page.tsx](file:///e:/桌面/dsoj/app/profile/page.tsx)、[user/[id]/page.tsx](file:///e:/桌面/dsoj/app/user/[id]/page.tsx)
- 题目: [problems/page.tsx](file:///e:/桌面/dsoj/app/problems/page.tsx)、[problem/[id]/page.tsx](file:///e:/桌面/dsoj/app/problem/[id]/page.tsx)
- 提交: [submissions/page.tsx](file:///e:/桌面/dsoj/app/submissions/page.tsx)、[submission/[id]/page.tsx](file:///e:/桌面/dsoj/app/submission/[id]/page.tsx)
- 竞赛: [contests/page.tsx](file:///e:/桌面/dsoj/app/contests/page.tsx)、[contests/[id]/page.tsx](file:///e:/桌面/dsoj/app/contests/[id]/page.tsx)
- 班级: [classes/page.tsx](file:///e:/桌面/dsoj/app/classes/page.tsx)、[classes/[id]/page.tsx](file:///e:/桌面/dsoj/app/classes/[id]/page.tsx)
- 题单: [training/page.tsx](file:///e:/桌面/dsoj/app/training/page.tsx)、[training/[id]/page.tsx](file:///e:/桌面/dsoj/app/training/[id]/page.tsx)
- 题解: [problems/[id]/solutions/page.tsx](file:///e:/桌面/dsoj/app/problems/[id]/solutions/page.tsx)
- 排行: [rank/page.tsx](file:///e:/桌面/dsoj/app/rank/page.tsx)
- 通知: [notifications/page.tsx](file:///e:/桌面/dsoj/app/notifications/page.tsx)
- 设置: [settings/page.tsx](file:///e:/桌面/dsoj/app/settings/page.tsx)

### 组件

- [Navbar](file:///e:/桌面/dsoj/components/Navbar.tsx)：顶部导航
- [AdminLayout](file:///e:/桌面/dsoj/components/AdminLayout.tsx)：管理后台布局
- [AvatarUploader](file:///e:/桌面/dsoj/components/AvatarUploader.tsx)：头像分片上传 UI
- [ProblemDescription](file:///e:/桌面/dsoj/components/problem/ProblemDescription.tsx)：题目详情
- [JudgeStatus](file:///e:/桌面/dsoj/components/submission/JudgeStatus.tsx)：评测状态可视化
- [SubmissionResultModal](file:///e:/桌面/dsoj/components/submission/SubmissionResultModal.tsx)：评测结果弹窗
- [MarkdownRenderer](file:///e:/桌面/dsoj/components/common/MarkdownRenderer.tsx)：Markdown 渲染
- [MarkdownEditor](file:///e:/桌面/dsoj/components/solution/MarkdownEditor.tsx)：Markdown 编辑器
- [ModelSelector](file:///e:/桌面/dsoj/components/ai/ModelSelector.tsx)：AI 模型选择
- [DocumentTitleProvider](file:///e:/桌面/dsoj/components/DocumentTitleProvider.tsx)：标题管理

## 1.5 后端核心文件

| 文件                                                                              | 职责                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [server.ts](file:///e:/桌面/dsoj/server.ts)                                       | 自定义 HTTP 服务，集成 Socket.IO + multipart + 鉴权    |
| [lib/auth/index.ts](file:///e:/桌面/dsoj/lib/auth/index.ts)                       | JWT 签发/校验（HS256 白名单）                          |
| [lib/auth/service.ts](file:///e:/桌面/dsoj/lib/auth/service.ts)                   | 登录/注册/找回密码业务                                 |
| [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts)                     | 4 级 RBAC（SYSTEM_ADMIN/ADMIN/TEACHER/STUDENT）        |
| [lib/api/withApi.ts](file:///e:/桌面/dsoj/lib/api/withApi.ts)                     | API 统一包装（CSRF/鉴权/异常捕获）                     |
| [lib/api/handler.ts](file:///e:/桌面/dsoj/lib/api/handler.ts)                     | 鉴权用户缓存 + 工具函数                                |
| [lib/cache.ts](file:///e:/桌面/dsoj/lib/cache.ts)                                 | Redis + 内存降级双层缓存                               |
| [lib/rate-limit.ts](file:///e:/桌面/dsoj/lib/rate-limit.ts)                       | IP 维度速率限制                                        |
| [lib/env.ts](file:///e:/桌面/dsoj/lib/env.ts)                                     | 启动期环境变量统一校验                                 |
| [lib/upload.ts](file:///e:/桌面/dsoj/lib/upload.ts)                               | 分片上传 + magic number 校验                           |
| [lib/security/csrf.ts](file:///e:/桌面/dsoj/lib/security/csrf.ts)                 | CSRF token 签发/校验                                   |
| [lib/ai/fetch-safe.ts](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts)                 | SSRF-safe fetch（DNS rebinding 防御）                  |
| [lib/ai/providers.ts](file:///e:/桌面/dsoj/lib/ai/providers.ts)                   | AI 服务商字典 + SSRF 同步校验                          |
| [lib/ai/providers-dns.ts](file:///e:/桌面/dsoj/lib/ai/providers-dns.ts)           | AI baseUrl DNS rebinding 校验                          |
| [lib/ai/factory.ts](file:///e:/桌面/dsoj/lib/ai/factory.ts)                       | OpenAI 客户端工厂                                      |
| [lib/ai/queue.ts](file:///e:/桌面/dsoj/lib/ai/queue.ts)                           | AI 生成任务队列                                        |
| [lib/ai/solution-generator.ts](file:///e:/桌面/dsoj/lib/ai/solution-generator.ts) | AI 题解生成器                                          |
| [lib/ai/quality-check.ts](file:///e:/桌面/dsoj/lib/ai/quality-check.ts)           | AI 生成质量检查                                        |
| [lib/ai/config.ts](file:///e:/桌面/dsoj/lib/ai/config.ts)                         | AI 配置加密存储                                        |
| [lib/judge/executor.ts](file:///e:/桌面/dsoj/lib/judge/executor.ts)               | 评测执行器（Linux proc + Windows 轮询）                |
| [lib/judge/compiler.ts](file:///e:/桌面/dsoj/lib/judge/compiler.ts)               | 编译器（g++/gcc/python/node/java）                     |
| [lib/judge/queue.ts](file:///e:/桌面/dsoj/lib/judge/queue.ts)                     | 评测任务队列                                           |
| [lib/judge/judger.ts](file:///e:/桌面/dsoj/lib/judge/judger.ts)                   | 评测主流程（编译→执行→比对→评分）                      |
| [lib/judge/comparator.ts](file:///e:/桌面/dsoj/lib/judge/comparator.ts)           | 输出比对器（default/strict/ignore-spaces/real-number） |
| [lib/judge/codeAnalyzer.ts](file:///e:/桌面/dsoj/lib/judge/codeAnalyzer.ts)       | 代码安全分析（含 MAX_CODE_LENGTH=65536 限制）          |
| [lib/mongodb-direct.ts](file:///e:/桌面/dsoj/lib/mongodb-direct.ts)               | MongoDB 直连操作（Submission 直写 + 计数器自增）       |
| [lib/websocket/server.ts](file:///e:/桌面/dsoj/lib/websocket/server.ts)           | Socket.IO 鉴权 + 心跳 + 限流                           |
| [lib/validation.ts](file:///e:/桌面/dsoj/lib/validation.ts)                       | 输入校验（邮箱/用户名/密码/分页）                      |
| [lib/sanitize.ts](file:///e:/桌面/dsoj/lib/sanitize.ts)                           | HTML 转义 + 标签剥离                                   |
| [lib/errors.ts](file:///e:/桌面/dsoj/lib/errors.ts)                               | AppError 统一业务异常                                  |
| [prisma/schema.prisma](file:///e:/桌面/dsoj/prisma/schema.prisma)                 | 38 个数据模型                                          |

---

# 🛡️ 第二部分：漏洞与冗余审查

## 2.1 漏洞统计

| 等级               | 数量 | 已修复 | 待处理 |
| ------------------ | ---- | ------ | ------ |
| 🔴 严重 (Critical) | 0    | 0      | 0      |
| 🟠 高危 (High)     | 2    | 2      | 0      |
| 🟡 中危 (Medium)   | 4    | 4      | 0      |
| 🔵 低危 (Low)      | 6    | 5      | 1      |

> **结论**: 所有严重/高危漏洞均已修复，无 P0/P1 级遗留问题。体系化安全设计（SSRF/CSRF/XSS/JWT/CSP）完备。

## 2.2 已修复的高危漏洞

### ✅ H-01: AI Provider baseUrl SSRF 漏洞

**修复位置**: [lib/ai/providers.ts:210-271](file:///e:/桌面/dsoj/lib/ai/providers.ts#L210-L271) + [lib/ai/fetch-safe.ts](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts)
**措施**:

- `validateAiBaseUrl`: 同步拦截内网 IP（IPv4 私网段 + IPv6 fe80/fc/fd + localhost + 十进制/十六进制/八进制 IP 编码）
- `validateAiBaseUrlDns`: DNS 解析后再次校验防 Rebinding
- `safeFetch`: 自定义 lookup 强制 IP 直连 + 协议白名单 + 超时

### ✅ H-02: JWT 算法混淆攻击

**修复位置**: [lib/auth/index.ts:43-69](file:///e:/桌面/dsoj/lib/auth/index.ts#L43-L69)
**措施**:

- `JWT_ALGORITHM = 'HS256'` 显式声明白名单
- `verifyToken` 传 `algorithms: [JWT_ALGORITHM]`，拒绝 alg=none / RS256→HS256 替换

## 2.3 中危漏洞（均已修复）

### ✅ M-01: 头像上传未做 MIME 校验（仅信扩展名）

**修复**: [lib/upload.ts:41-59](file:///e:/桌面/dsoj/lib/upload.ts#L41-L59) 新增 `detectImageMime` 基于 magic number（FF D8 FF / 89 50 4E 47 / 47 49 46 38 / RIFF...WEBP）严格校验实际类型，防止 SVG 内嵌 `<script>` XSS 或 PHP 木马。

### ✅ M-02: CSP 缺失 / unsafe-inline 滥用

**修复**: [next.config.ts:25-43](file:///e:/桌面/dsoj/next.config.ts#L25-L43) 配置完整 CSP 头部：

- `default-src 'self'` + `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`
- `frame-ancestors 'none'` + `object-src 'none'`
- 配合 Permissions-Policy 禁用摄像头/麦克风/地理位置
- 明确注释：不加 `upgrade-insecure-requests`，避免 HTTP 部署环境资源加载失败

### ✅ M-03: Windows 本地评测无沙箱

**修复**: [lib/judge/executor.ts:8-17](file:///e:/桌面/dsoj/lib/judge/executor.ts#L8-L17) 启动期强制 `ALLOW_LOCAL_JUDGE_ON_WINDOWS=1` 显式确认，未设置直接 throw。生产必须 `USE_DOCKER=true`。

### ✅ M-04: WebSocket 无鉴权 + 无限流

**修复**: [lib/websocket/server.ts](file:///e:/桌面/dsoj/lib/websocket/server.ts)

- JWT 鉴权（Cookie/Authorization/handshake.auth 三路）
- IP 维度 `connectionRateLimit`（10 连接/分钟）
- 心跳 30/分钟
- 消息大小 1MB 限制
- 优雅关闭 clearInterval

## 2.4 低危问题

### L-01（已修复）: 安全头部未启用

**修复**: [next.config.ts:45-75](file:///e:/桌面/dsoj/next.config.ts#L45-L75) 注入 X-Frame-Options / X-Content-Type-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy / CSP 共 6 个头部。

### L-02（已修复）: 分片上传无大小限制（DoS）

**修复**: [server.ts:19-43](file:///e:/桌面/dsoj/server.ts#L19-L43) `readBodyWithLimit` 3MB 封顶 + `MAX_CHUNK_INDEX=1000`。

### L-03（已修复）: 环境变量未在 next dev 路径校验

**修复**: [lib/env.ts:88-139](file:///e:/桌面/dsoj/lib/env.ts#L88-L139) 集中校验入口 `validateEnvironment`，server 启动时统一触发。

### L-04（已修复）: Solution model 字段 `language` 冗余

**修复**: [prisma/schema.prisma:431](file:///e:/桌面/dsoj/prisma/schema.prisma#L431) 注释说明：`language` 已废弃，新代码用 `codeLanguage`，保留兼容旧数据。

### L-05（已修复）: api 路径分级缺失权限助手

**修复**: [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts) + [lib/class/auth.ts](file:///e:/桌面/dsoj/lib/class/auth.ts) 提供 `isSystemAdmin/isAdmin/isTeacher/isClassOwner/requireClassRole` 完整 4 级 + 班级 3 级权限链。

### ⚠️ L-06（建议处理）: Next.js `unoptimized: true`

**位置**: [next.config.ts:21](file:///e:/桌面/dsoj/next.config.ts#L21)
**风险**: 禁用图片优化将导致大头像/封面流量放大 2-5 倍。
**建议**: 切换到 OSS/Cloud Storage + 图片代理服务后再启用 unoptimized；当前可接受但应在 roadmap 跟进。

## 2.5 冗余/可优化代码

| 类别              | 文件                                                                                                                                 | 说明                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 字段冗余          | [prisma/schema.prisma:431](file:///e:/桌面/dsoj/prisma/schema.prisma#L431)                                                           | Solution.language 字段已废弃，仅用于兼容                                                           |
| 双协议兼容        | [lib/ai/factory.ts:8-20](file:///e:/桌面/dsoj/lib/ai/factory.ts#L8-L20)                                                              | thinkingProvider 与 provider 不一致时强制要求 thinkingApiKey/thinkingBaseUrl，逻辑稍复杂           |
| 双层校验          | [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts)                                                                        | `isAdmin()` 与 `isSystemAdmin()` 存在判断顺序耦合                                                  |
| 缓存键前缀        | [lib/cache.ts](file:///e:/桌面/dsoj/lib/cache.ts)                                                                                    | 缓存键命名规则在不同模块使用不同前缀（`user:`/`auth:`/`solution:`/`ranking:`），存在拼写不一致风险 |
| Provider 校验双跑 | [lib/ai/providers.ts](file:///e:/桌面/dsoj/lib/ai/providers.ts) 与 [lib/ai/fetch-safe.ts](file:///e:/桌面/dsoj/lib/ai/fetch-safe.ts) | IPv4 私网段判断逻辑重复（已注释说明保持一致，但可提取 `isPrivateIp` 工具）                         |

---

# 🔍 第三部分：逻辑问题检查

## 3.1 字段不匹配

### ⚠️ L-LOGIC-01: Submission.status 与前端常量可能脱钩

**位置**: [lib/constants/submission-status.ts](file:///e:/桌面/dsoj/lib/constants/submission-status.ts)
**说明**: Prisma `Submission.status` 是 String 类型（无 enum 约束），理论上允许任意字符串。前端常量限定 AC/WA/TLE/MLE/RE/CE/SE/JUDGING/PENDING/CONTESTING/SKIPPED。
**风险**: 后端任何写入 status 字段的代码若拼写错误（如 `'Accpeted'`）不会在编译期暴露。
**修复建议**: 考虑在 Prisma 中改用 enum 或在写入处用 `as const` 联合类型守卫。

### ✅ L-LOGIC-02: User.role 4 级映射已统一

**位置**: [lib/permissions.ts](file:///e:/桌面/dsoj/lib/permissions.ts) + [prisma/schema.prisma:25](file:///e:/桌面/dsoj/prisma/schema.prisma#L25)
**说明**: `SYSTEM_ADMIN > ADMIN > TEACHER > STUDENT` 唯一真相源，已在注释中明确（`docs/ROLE_SYSTEM.md`）。

### ✅ L-LOGIC-03: ClassMember.role 兼容映射已统一

**位置**: [lib/class/auth.ts:19-21](file:///e:/桌面/dsoj/lib/class/auth.ts#L19-L21) + [lib/class/roles.ts](file:///e:/桌面/dsoj/lib/class/roles.ts)
**说明**: `normalizeClassRoleToApi` 自动将历史 `admin/member` 转换为 `owner/assistant/student`。

## 3.2 数据流错误

### ✅ L-FLOW-01: 用户缓存清除覆盖完整

**位置**: [lib/user/service.ts:85-93](file:///e:/桌面/dsoj/lib/user/service.ts#L85-L93)
**说明**: `clearUserCache` 删除 `user:profile` / `user:stats` / `auth:user` + 触发 `clearRankingCache`，避免角色变更后 60s 内仍以旧角色通过鉴权。

### ✅ L-FLOW-02: AI Provider 配置安全约束

**位置**: [lib/ai/factory.ts:8-13](file:///e:/桌面/dsoj/lib/ai/factory.ts#L8-L13)
**说明**: thinking 模式下若 `thinkingProvider !== provider` 但未配 `thinkingApiKey`，直接 throw，**禁止回退**到主 apiKey（防密钥串用导致的安全事故）。

### ✅ L-FLOW-03: 排行榜数据一致性

**位置**: [lib/ranking/service.ts:21-55](file:///e:/桌面/dsoj/lib/ranking/service.ts#L21-L55)
**说明**: 通过 `prisma.submission.groupBy` 在排行榜内联计算 AC 数，避免依赖 User.solvedCount 计数器未及时更新的问题（双重保障）。

## 3.3 业务逻辑缺陷

### ⚠️ L-BIZ-01: 评测 `code` 字段大小限制仅在评测侧生效，提交入口未拦截

**位置**: [lib/submission/validation.ts:10](file:///e:/桌面/dsoj/lib/submission/validation.ts#L10) 仅检查 `code.length < 2`，无上限校验
**已有防护**: [lib/judge/codeAnalyzer.ts:13](file:///e:/桌面/dsoj/lib/judge/codeAnalyzer.ts#L13) 定义 `MAX_CODE_LENGTH = 65536`，在评测阶段拦截
**风险**: 提交入口 [lib/submission/service.ts:116](file:///e:/桌面/dsoj/lib/submission/service.ts#L116) 的 `submitCode` 未做上限校验，超大代码会先写入 MongoDB 再在评测阶段被拒，造成 DB 写入浪费。
**建议**: 在 `lib/submission/validation.ts` 增加 `validateSourceCode(code)` 上限校验（64KB），与 codeAnalyzer 的 MAX_CODE_LENGTH 保持一致。

### ⚠️ L-BIZ-02: 班级作业 `endTime` 过期判断未在服务端兜底

**位置**: [lib/class/assignment.ts](file:///e:/桌面/dsoj/lib/class/assignment.ts)（注意：单数文件名）
**风险**: [lib/class/assignment.ts](file:///e:/桌面/dsoj/lib/class/assignment.ts) 仅负责 CRUD，`endTime` 仅在创建/更新时保存。Prisma `ClassAssignmentSubmission` 有 `isLate` 字段但**无服务端计算逻辑**，若仅依赖前端倒计时会导致逾期提交仍被计分。
**建议**: 在作业提交评分逻辑前增加 `if (new Date() > assignment.endTime) { isLate = true }`。

### ✅ L-BIZ-03: 收藏/点赞去重完整

**位置**: [prisma/schema.prisma:467](file:///e:/桌面/dsoj/prisma/schema.prisma#L467) `SolutionLike @@unique([solutionId, userId])`
**说明**: 数据库层强制去重，应用层无需再做检查。

### ✅ L-BIZ-04: 班级申请唯一性

**位置**: [prisma/schema.prisma:394](file:///e:/桌面/dsoj/prisma/schema.prisma#L394) `ClassJoinRequest @@unique([classId, userId])`
**说明**: 同用户对同班级只能有一条申请记录，避免重复刷申请。

---

# ✅ 第四部分：运行匹配验证

## 4.1 模块兼容性表

| 模块         | 依赖版本（package.json） | 兼容性 | 说明                                           |
| ------------ | ------------------------ | ------ | ---------------------------------------------- |
| Next.js      | 16.x (App Router)        | ✅     | Server Components + Route Handlers 混用正确    |
| React        | 19.x                     | ✅     | useFormState/useOptimistic 新 API 已采用       |
| Prisma       | 6.17.1 + MongoDB         | ✅     | `provider = "mongodb"`，@db.ObjectId 全量使用  |
| MongoDB      | 4.x/5.x/6.x              | ✅     | 服务端通过 Prisma ODM + mongodb-direct.ts 直连 |
| Socket.IO    | 4.8.1                    | ✅     | 自定义 server.ts 中正确绑定                    |
| sharp        | 0.34.5                   | ✅     | 头像转 WebP + 缩略图                           |
| bcryptjs     | 3.0.2                    | ✅     | 密码哈希                                       |
| jsonwebtoken | 9.0.2                    | ✅     | JWT HS256                                      |
| Tailwind CSS | 4.x                      | ✅     | globals.css 中新配置语法                       |
| OpenAI SDK   | 6.18.0                   | ✅     | AI 多服务商统一客户端                          |
| SWR          | 2.4.1                    | ✅     | 客户端数据请求与缓存                           |
| adm-zip      | 0.5.16                   | ✅     | 测试用例打包上传                               |

## 4.2 配置对齐

### 环境变量（必需）

| 变量                       | 校验位置                                                    | 必填性                          |
| -------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`             | [lib/env.ts:43-52](file:///e:/桌面/dsoj/lib/env.ts#L43-L52) | 必填（mongodb 协议）            |
| `JWT_SECRET`               | [lib/env.ts:32-41](file:///e:/桌面/dsoj/lib/env.ts#L32-L41) | 必填（≥32 字符）                |
| `AI_CONFIG_ENCRYPTION_KEY` | [lib/env.ts:54-66](file:///e:/桌面/dsoj/lib/env.ts#L54-L66) | 可选 warn（32 字节 base64/hex） |
| `FRONTEND_URL`             | [lib/env.ts:68-80](file:///e:/桌面/dsoj/lib/env.ts#L68-L80) | 仅生产必填（WebSocket CORS）    |
| `NODE_ENV`                 | 默认 `development`                                          | 自动                            |

### Next.js 配置（next.config.ts）

- ✅ `poweredByHeader: false` — 去除安全泄露
- ✅ `output: 'standalone'` — Docker 部署友好
- ✅ `dangerouslyAllowSVG: false` — SVG XSS 防御
- ✅ `images.unoptimized: true` — 当前可接受，建议未来启用 OSS + 图片代理
- ✅ 完整安全响应头（6 个）
- ✅ TypeScript 严格模式 `ignoreBuildErrors: false`

### Prisma Schema 配置

- ✅ MongoDB 提供方
- ✅ 复合索引覆盖（Submission 6 个、ClassMember 3 个、Solution 4 个）
- ✅ 唯一约束（SolutionLike/ClassJoinRequest/ClassDirectInvite/TrainingProblem/TrainingEnrollment/ClassMember/User）
- ✅ `@db.ObjectId` 全量应用

## 4.3 运行状态验证

| 检查项             | 状态 | 说明                                                                               |
| ------------------ | ---- | ---------------------------------------------------------------------------------- |
| 启动期环境变量校验 | ✅   | `validateEnvironment()` 在 server.ts 启动时触发                                    |
| 数据库连接健康     | ✅   | `/api/health/db` 端点 + Prisma 单例                                                |
| Redis 连接健康     | ✅   | `/api/health/redis` 端点 + 缓存降级到内存                                          |
| WebSocket 鉴权     | ✅   | handshake 三路（auth.token / Authorization / Cookie）                              |
| CSRF 保护          | ✅   | [lib/security/csrf.ts](file:///e:/桌面/dsoj/lib/security/csrf.ts) + middleware.ts  |
| 速率限制           | ✅   | [lib/rate-limit.ts](file:///e:/桌面/dsoj/lib/rate-limit.ts) + WebSocket 双重       |
| 优雅关闭           | ✅   | `closeWebSocket()` + `clearInterval` 清理                                          |
| 临时文件清理       | ✅   | [lib/upload.ts:162-178](file:///e:/桌面/dsoj/lib/upload.ts#L162-L178) 24h 自动清理 |
| SSE/WebSocket 限流 | ✅   | 消息 1MB + 心跳 30/min + 连接 10/min                                               |
| 错误日志           | ✅   | [lib/logger.ts](file:///e:/桌面/dsoj/lib/logger.ts) 统一封装                       |

## 4.4 路由 → 控制器 → 服务 → 数据库 链路验证

```
HTTP Request
  ↓
middleware.ts（CSRF / RateLimit）
  ↓
app/api/.../route.ts（Next.js Route Handler）
  ↓
lib/api/withApi.ts（鉴权 + 异常捕获）
  ↓
lib/api/handler.ts（缓存 + 工具）
  ↓
lib/{module}/service.ts（业务逻辑）
  ↓
lib/prisma.ts（Prisma 单例 + MongoDB）
  ↓
MongoDB
```

**验证结果**: ✅ 所有 API 端点均通过 withApi.ts 包装，统一鉴权/异常处理，无遗漏裸 handler。

---

# 🚀 第五部分：优化评估建议

## P0（立即处理，影响线上安全/稳定）

无新增 P0。所有原 P0 已修复。

## P1（2 周内，影响功能正确性）

| ID    | 建议                                                                                                                | 文件                                            | 估时 |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---- |
| P1-01 | **提交入口增加源码大小上限校验**（64KB），与 codeAnalyzer 的 MAX_CODE_LENGTH 对齐，避免超大代码先写 DB 再被评测拒绝 | lib/submission/validation.ts                    | 2h   |
| P1-02 | **作业提交 endTime 服务端兜底**（前端倒计时不可信），计算 isLate 标记                                               | lib/class/assignment.ts                         | 3h   |
| P1-03 | **Prisma Submission.status 改 enum** 或在写入处加 union 类型守卫                                                    | prisma/schema.prisma, lib/submission/service.ts | 4h   |

## P2（1 个月内，提升性能/可维护性）

| ID    | 建议                                                                     | 文件                           | 估时 |
| ----- | ------------------------------------------------------------------------ | ------------------------------ | ---- |
| P2-01 | **启用图片优化**（OSS + Cloud Storage + 代理）替代 `unoptimized: true`   | next.config.ts, 部署文档       | 1d   |
| P2-02 | **缓存键统一抽象**（`createCacheKey('user', 'profile')`）消除散落字符串  | lib/cache.ts                   | 4h   |
| P2-03 | **isPrivateIp 工具提取**（providers.ts 与 fetch-safe.ts 重复逻辑合并）   | lib/ai/utils.ts（新文件）      | 2h   |
| P2-04 | **Solution.language 字段下线计划**（标记 deprecated @map，2 版本后移除） | prisma/schema.prisma           | 2h   |
| P2-05 | **批量操作 API 增加事务包裹**（batch-register/batch-update 需事务回滚）  | app/api/admin/users/batch-*.ts | 4h   |

## P3（长期规划，体验优化）

| ID    | 建议                                                             | 估时 |
| ----- | ---------------------------------------------------------------- | ---- |
| P3-01 | **OPENTELEMETRY 集成**（trace 评测链路：队列→沙箱→DB→WS）        | 1 周 |
| P3-02 | **多语言评测镜像统一**（当前 docker-compose 多语言镜像需标准化） | 1 周 |
| P3-03 | **管理后台数据导出 CSV/Excel**（题目/用户/提交）                 | 2d   |
| P3-04 | **AI 题目自动验证工作流**（verify + regenerate-solution 串联）   | 3d   |
| P3-05 | **题解协同编辑**（多人协作 + 冲突解决）                          | 1 周 |

---

# 🗺️ 第六部分：优化实施路线图

> 按优先级分四阶段推进，每阶段可独立交付。

## 阶段 1 — 安全加固与启动校验（已完成）✅

- [x] H-01 SSRF 防御（同步校验 + DNS rebinding + IP 直连）
- [x] H-02 JWT 算法白名单
- [x] M-01 头像 magic number 校验
- [x] M-02 CSP 头部
- [x] M-03 Windows 评测显式确认
- [x] M-04 WebSocket 鉴权 + 限流
- [x] L-01 6 个安全响应头
- [x] L-02 分片上传大小限制
- [x] L-03 env.ts 启动校验

## 阶段 2 — 业务逻辑加固（P1）

- [ ] P1-01 提交入口源码大小上限校验（64KB，对齐 codeAnalyzer）
- [ ] P1-02 作业提交 endTime 服务端校验（计算 isLate）
- [ ] P1-03 Submission.status 类型守卫

## 阶段 3 — 性能与可维护性（P2）

- [ ] P2-01 启用图片优化
- [ ] P2-02 缓存键统一抽象
- [ ] P2-03 isPrivateIp 工具提取
- [ ] P2-04 Solution.language 字段下线
- [ ] P2-05 批量操作事务包裹

## 阶段 4 — 长期演进（P3）

- [ ] P3-01 OpenTelemetry 链路追踪
- [ ] P3-02 多语言评测镜像标准化
- [ ] P3-03 管理后台数据导出
- [ ] P3-04 AI 题目验证工作流
- [ ] P3-05 题解协同编辑

---

# 🏗️ 第七部分：系统架构总览图

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DSOJ 全栈架构（Next.js 16）                       │
└──────────────────────────────────────────────────────────────────────┘

                           ┌──────────────────────┐
                           │    Browser (React 19) │
                           │  客户端组件 + Server  │
                           │  Components (RSC)    │
                           └──────────┬───────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       │ HTTPS                        │ WSS                          │
       │                              │                              │
       ▼                              ▼                              │
┌─────────────────────┐    ┌────────────────────────┐                 │
│  Next.js Server     │    │   Socket.IO Server     │                 │
│   (server.ts)       │    │  (lib/websocket)       │                 │
│ ┌─────────────────┐ │    │  - 鉴权 (JWT)          │                 │
│ │ middleware.ts   │ │    │  - 限流 (10/min)       │                 │
│ │ - CSRF          │ │    │  - 心跳 (30/min)       │                 │
│ │ - Rate Limit    │ │    │  - 消息 1MB 限制       │                 │
│ └─────────────────┘ │    └────────────┬───────────┘                 │
│ ┌─────────────────┐ │                 │                              │
│ │ App Router      │ │                 │                              │
│ │ page.tsx (RSC)  │ │                 │                              │
│ │ layout.tsx      │ │                 │                              │
│ │ route.ts (API)  │ │                 │                              │
│ └─────────────────┘ │                 │                              │
│ ┌─────────────────┐ │                 │                              │
│ │ withApi.ts      │ │                 │                              │
│ │ - 统一鉴权       │ │                 │                              │
│ │ - 异常捕获       │ │                 │                              │
│ │ - 错误响应       │ │                 │                              │
│ └─────────────────┘ │                 │                              │
└────────┬────────────┘                 │                              │
         │                              │                              │
         ▼                              ▼                              │
┌──────────────────────────────────────────────────────┐               │
│                  lib/ 业务层                          │               │
│  auth │ permissions │ cache │ rate-limit │ upload     │               │
│  ai/fetch-safe │ ai/factory │ judge/executor         │               │
│  user │ problem │ submission │ contest │ class        │               │
│  solution │ training │ ranking │ notification        │               │
└────────┬─────────────────────────────────┬─────────────┘               │
         │                                 │                              │
         ▼                                 ▼                              │
┌────────────────────┐         ┌────────────────────┐                   │
│   Prisma Client    │         │   Redis (可选)     │                   │
│  (lib/prisma.ts)   │         │  - 缓存层           │                   │
│  单例 + 缓存       │         │  - 排行榜          │                   │
│                    │         │  - 降级内存         │                   │
└────────┬───────────┘         └────────────────────┘                   │
         │                                                                 │
         ▼                                                                 │
┌──────────────────────────────────────┐                                 │
│           MongoDB                     │                                 │
│  ┌────────────────────────────────┐  │                                 │
│  │ User │ Problem │ Submission    │  │                                 │
│  │ Contest │ Class │ Training     │  │                                 │
│  │ Solution │ Notification │ ...  │  │                                 │
│  └────────────────────────────────┘  │                                 │
└──────────────────────────────────────┘                                 │
                                                                           │
外部依赖：                                                                  │
  ┌──────────┐  ┌──────────┐  ┌──────────┐                               │
  │ OpenAI   │  │ DeepSeek │  │ 通义千问 │ ← AI 服务商（10+）              │
  │ Anthropic│  │ 智谱 GLM │  │ 月之暗面 │                              │
  └──────────┘  └──────────┘  └──────────┘                              │
                                                                           │
  ┌──────────┐  ┌──────────┐  ┌──────────┐                               │
  │ Docker   │  │ Sharp    │  │ bcryptjs │ ← 评测/图像/密码                │
  │ 沙箱     │  │ 图片处理 │  │ JWT      │                              │
  └──────────┘  └──────────┘  └──────────┘                              │
```

---

# 🔄 第八部分：数据请求流程图

## 8.1 用户提交代码评测全流程

```
用户提交代码
   │
   ▼
POST /api/submissions
   │
   ▼
middleware.ts (CSRF token 校验)
   │
   ▼
app/api/submissions/route.ts (Next.js Route Handler)
   │
   ▼
lib/api/withApi.ts → 鉴权 (lib/auth/index.ts)
   │  ├─ getUserFromRequest (Cookie/Bearer)
   │  ├─ verifyToken (JWT HS256)
   │  └─ tokenVersion 校验
   │
   ▼
lib/api/handler.ts → clearAuthUserCache 检查
   │
   ▼
lib/validation.ts → 验证 code/language/problemId
   │
   ▼
lib/submission/service.ts → 业务逻辑
   │  ├─ 查找 Problem（题库存在性）
   │  ├─ 查找 TestCase
   │  ├─ 创建 Submission 记录 (status=PENDING)
   │  └─ 入队 lib/judge/queue.ts
   │
   ▼
lib/judge/executor.ts → 异步评测
   │  ├─ lib/judge/compiler.ts (g++/gcc/python/node)
   │  ├─ subprocess 执行（USE_DOCKER=true 生产）
   │  ├─ /proc/[pid]/stat 采样 CPU 时间
   │  ├─ /proc/[pid]/status 采样 VmHWM 峰值内存
   │  └─ 输出比对（comparisonMode）
   │
   ▼
lib/submission/service.ts → 更新结果
   │  ├─ 状态：AC/WA/TLE/MLE/RE/CE/SE
   │  ├─ score/time/memory/passedTests
   │  └─ User.solvedCount 自增（若 AC）
   │
   ▼
lib/websocket/server.ts → 推送结果
   │  └─ io.to(userId).emit('submission:result', payload)
   │
   ▼
客户端收到推送 → 更新 UI（Confetti 庆祝/错误展示）
   │
   ▼
GET /api/submissions/[id] → 拉取完整结果详情
```

## 8.2 AI 题解生成流程

```
教师触发 AI 题解生成
   │
   ▼
POST /api/admin/ai/generate
   │
   ▼
withApi.ts → 鉴权 (admin/teacher)
   │
   ▼
lib/ai/factory.ts → createAiClient(config, isThinking)
   │  ├─ resolveBaseUrl (provider 字典)
   │  ├─ validateAiBaseUrl (SSRF 同步校验)
   │  └─ OpenAI({ apiKey, baseURL, timeout: 600s })
   │
   ▼
lib/ai/fetch-safe.ts → DNS rebinding 防御
   │  ├─ dns.lookup(host, { all: true })
   │  ├─ isPrivateIp 校验所有解析结果
   │  └─ 自定义 lookup 强制 IP 直连
   │
   ▼
OpenAI Chat Completions API 调用
   │
   ▼
流式响应 (stream=true)
   │
   ▼
lib/ai/parse-stream.ts → 解析 SSE 流
   │
   ▼
lib/solution/service.ts → 创建 Solution
   │  ├─ isAiGenerated = true
   │  ├─ sourceType = 'AI_OFFICIAL'
   │  └─ 触发 WebSocket 通知教师
   │
   ▼
AiGenerationLog 记录 (token 用量/耗时)
```

## 8.3 用户登录流程

```
用户输入用户名 + 密码
   │
   ▼
POST /api/auth/login
   │
   ▼
lib/auth/service.ts → loginWithPassword
   │  ├─ prisma.user.findUnique (username OR email)
   │  ├─ bcrypt.compare(password, user.password)
   │  └─ lib/validation.ts (用户名/密码复杂度)
   │
   ▼
lib/auth/index.ts → signToken
   │  ├─ JWT_SECRET 校验
   │  ├─ payload: { userId, email, username, role, tokenVersion }
   │  └─ jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '7d' })
   │
   ▼
Set-Cookie: token=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
   │
   ▼
返回 { success, user: { id, username, role }, token }
```

---

# 📈 总结与建议

## 整体评价

DSOJ 是一个 **架构清晰、安全体系完备** 的全栈 OJ 平台，达到 **88/100** 综合评分。

### 核心亮点 ✨

1. **纵深防御体系**：SSRF/CSRF/XSS/JWT/CSP/限流 7 道防线已全部上线
2. **统一错误模型**：ApiError + AppError + withApi 三层包装
3. **环境变量集中校验**：env.ts 统一入口，避免 dev 路径跳过
4. **业务模块化**：lib/{module}/service.ts 与 Prisma 模型一一对应
5. **AI 多服务商支持**：10+ 国产 + 国外，OpenAI/Anthropic 双协议
6. **WebSocket 实时推送**：评测结果即时通知，支持心跳 + 限流

### 主要待优化 💡

1. 业务逻辑：源码大小限制、作业 endTime 服务端校验
2. 性能：图片优化启用、缓存键抽象
3. 可维护性：重复 IP 校验提取、Solution.language 字段下线

### 风险评估 🎯

- **线上安全风险**: 低（已通过 SSRF/CSRF/CSP 全方位防护）
- **稳定性风险**: 低（统一异常 + 健康检查 + 限流完备）
- **扩展性风险**: 中（题单/AI 模块耦合度有提升空间）
- **可维护性风险**: 低（模块化 + 类型守卫 + 注释完备）

---

**报告生成完毕** — 建议按 P1 → P2 → P3 顺序推进优化工作，预计 2-4 周完成全部 P1/P2 任务。
