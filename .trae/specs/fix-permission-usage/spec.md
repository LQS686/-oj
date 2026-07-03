# 修复权限系统实际使用 Spec

## Why

权限系统的数据模型和核心 API（`hasPermission`）已实现，但实际几乎未被使用：
- 30+ 处 admin API 路由仍用裸 `isSystemAdmin(user)` 内部判断，而非 `withPermission(code)` 包装
- 服务端组件和服务层仍用 `isAdmin`/`isTeacher`/`canCreateClass` 等粗粒度角色函数
- 客户端 `usePermission` hook 仅基于 `user.role` 字符串做本地判断，未查询后端实际权限
- 所有 admin 路由都包装 `withPermission('admin.access')`，导致只要有 `admin.access` 就能访问全部后台功能，无细粒度可言
- 社区系统已移除，但 `post.*` 权限点和相关死代码仍残留，甚至存在断裂 import（`app/api/comments/recent/route.ts` 引用已删除的 `@/lib/post/service`）

## What Changes

### 1. 移除 post 相关权限点与死代码

- **BREAKING** 从 `PermissionCode` 类型移除 `post.create`/`post.edit`/`post.delete`/`post.pin`/`post.lock`
- 从 `usePermission.ts`、`permissions.ts`（降级默认集）、`seed.ts`、`seed-permissions.ts` 中移除所有 `post.*` 引用
- 删除断裂路由 `app/api/comments/recent/route.ts`（引用不存在的 `@/lib/post/service`）
- 清理 `lib/websocket/server.ts` 中 `join_post`/`leave_post`/`post:*` 死代码
- 清理 `lib/validation.ts` 中 `validatePostTitle`/`validatePostContent`/`validateCommentContent` 死代码
- 清理 `lib/category/service.ts` 中讨论分类种子数据
- 清理 `app/user/[id]/page.tsx` 中 `user._count?.posts` 展示残留
- 清理权限管理页面（`/admin/permissions`、`/admin/roles`、`/admin/users/[id]/permissions`）中 `post: '帖子'` 模块标签
- 清理 `prisma/seed.ts` 中 `db.collection('Post')` 直接操作 MongoDB 的种子数据

### 2. 新增权限点

新增 4 个权限点以支撑细粒度控制：

| 权限码 | 模块 | 名称 | 说明 |
|---|---|---|---|
| `announcement.manage` | announcement | 公告管理 | 管理系统公告 |
| `ai.manage` | ai | AI 管理 | 管理 AI 模型/Provider/配置 |
| `submission.view` | submission | 提交查看 | 查看所有用户提交记录 |
| `system.logs.view` | system | 日志查看 | 查看系统操作日志 |

### 3. admin API 路由按模块映射细粒度权限

将所有 admin 路由从统一 `admin.access` 改为按模块映射的具体权限：

| 路由 | 方法 | 当前权限 | 改为 |
|---|---|---|---|
| `/api/admin/dashboard` | GET | admin.access | admin.access（保留） |
| `/api/admin/problems` | GET | admin.access | problem.edit |
| `/api/admin/problems` | POST | admin.access | problem.create |
| `/api/admin/problems/[id]` | GET/PATCH/PUT | admin.access | problem.edit |
| `/api/admin/problems/[id]` | DELETE | admin.access | problem.delete |
| `/api/admin/problems/batch` | POST | admin.access | problem.edit |
| `/api/admin/problems/batch-source` | POST | admin.access | problem.edit |
| `/api/admin/problems/export` | GET | admin.access | problem.edit |
| `/api/admin/problems/review` | POST | admin.access | problem.review |
| `/api/admin/problems/[id]/verify` | POST | admin.access | problem.review |
| `/api/admin/problems/[id]/verification-logs` | GET | admin.access | problem.review |
| `/api/admin/problems/[id]/regenerate-solution` | POST | admin.access | problem.edit |
| `/api/admin/contests` | GET | admin.access | contest.edit |
| `/api/admin/contests` | POST | admin.access | contest.create |
| `/api/admin/contests/[id]` | GET/PATCH | admin.access | contest.edit |
| `/api/admin/contests/[id]` | DELETE | admin.access | contest.delete |
| `/api/admin/classes` | GET | admin.access | class.edit |
| `/api/admin/classes/[id]` | PATCH | admin.access | class.edit |
| `/api/admin/classes/[id]` | DELETE | admin.access | class.delete |
| `/api/admin/trainings` | GET | admin.access | training.edit |
| `/api/admin/users` | GET | admin.access | user.view |
| `/api/admin/users/[id]` | GET | admin.access | user.view |
| `/api/admin/users/[id]` | PATCH | admin.access | user.edit |
| `/api/admin/users/[id]` | DELETE | admin.access | user.delete |
| `/api/admin/users/[id]/permissions` | GET/PUT | admin.access | user.role.assign |
| `/api/admin/users/batch-update` | POST | admin.access | user.edit |
| `/api/admin/users/batch-register` | POST | admin.access | user.edit |
| `/api/admin/users/batch-delete` | POST | admin.access | user.delete |
| `/api/admin/announcements` | GET/POST | admin.access | announcement.manage |
| `/api/admin/announcements/[id]` | GET/PATCH/DELETE | admin.access | announcement.manage |
| `/api/admin/settings` | GET | admin.access | system.settings |
| `/api/admin/settings` | PUT | admin.access | system.settings |
| `/api/admin/permissions` | GET | admin.access | system.permission.manage |
| `/api/admin/roles` | GET/PUT | admin.access | system.permission.manage |
| `/api/admin/submissions` | GET | admin.access | submission.view |
| `/api/admin/logs/source-changes` | GET | admin.access | system.logs.view |
| `/api/admin/ai/**` | ALL | admin.access | ai.manage |

### 4. 服务端组件改用 hasPermission

将以下服务端组件中的角色硬编码检查改为 `hasPermission(user, code)`：

| 文件 | 当前 | 改为 |
|---|---|---|
| `app/contests/create/page.tsx` | `canCreateContest(user)` | `hasPermission(user, 'contest.create')` |
| `app/contests/[id]/page.tsx` | `payload.role === 'SYSTEM_ADMIN'` | `hasPermission(payload, 'contest.edit')` |
| `app/contests/[id]/layout.tsx` | `user.role === 'SYSTEM_ADMIN'` | `hasPermission(user, 'contest.edit')` |
| `app/classes/page.tsx` | `canCreateClass(user)` | `hasPermission(user, 'class.create')` |
| `app/classes/[id]/assignments/[assignmentId]/page.tsx` | `isAdmin(user) \|\| isTeacher(user)` | `hasPermission(user, 'class.assignment.manage')` |
| `app/problems/[id]/solutions/[solutionId]/page.tsx` | `role === 'SYSTEM_ADMIN' \|\| role === 'TEACHER'` | `hasPermission(user, 'problem.edit')` |
| `app/problems/[id]/solutions/[solutionId]/edit/page.tsx` | `role === 'SYSTEM_ADMIN'` | `hasPermission(user, 'problem.edit')` |

保留不动：`app/admin/users/page.tsx` 中 `role === 'SYSTEM_ADMIN'` 用于 UI 显示标签和禁用按钮（合理，这是展示逻辑不是权限门）。

### 5. 服务层改用 hasPermission

| 文件 | 当前 | 改为 |
|---|---|---|
| `lib/contest-auth.ts:58` | `role === 'SYSTEM_ADMIN'` | `hasPermission(currentUser, 'contest.edit')` |
| `lib/solution/permissions.ts:81,88,149,156` | `role === 'SYSTEM_ADMIN' \|\| 'TEACHER'` | `hasPermission(user, 'problem.edit')` |
| `lib/class/service.ts:609-610` | `role === 'SYSTEM_ADMIN' \|\| 'TEACHER'` | `hasPermission(u, 'class.edit')` |

保留不动：`lib/user/service.ts:939,965` 中 `target.role === 'SYSTEM_ADMIN'` 是保护系统管理员不被删除/降级的安全硬卡，合理保留。

### 6. 客户端权限系统改造

#### 6.1 扩展 /api/auth/me 返回权限列表

`getUserProfile` 或 `/api/auth/me` handler 中新增权限计算：返回用户的有效权限码数组 `permissions: string[]`。

计算逻辑：
1. SYSTEM_ADMIN → 返回全部权限码
2. 其他角色 → 查 RolePermission（角色默认权限）+ UserPermission（用户级覆盖，value=true 的追加，value=false 的移除）
3. 结果缓存 30s（复用 hasPermission 的缓存机制）

#### 6.2 改造 usePermission hook

- 移除本地 `TEACHER_PREFIXES`/`TEACHER_EXACT`/`STUDENT_ALLOWED` 硬编码逻辑
- 改为从 `/api/auth/me` 响应中读取 `permissions` 数组，检查是否包含目标 code
- 仍为客户端 UI 显隐控制，非安全门

#### 6.3 AdminLayout 菜单按权限显隐

`components/AdminLayout.tsx` 中每个菜单项增加 `permission` 字段，仅当用户拥有该权限时显示：

| 菜单项 | 权限 |
|---|---|
| 仪表盘 | admin.access |
| 题目管理 | problem.edit |
| AI 智能出题 | ai.manage |
| AI 模型管理 | ai.manage |
| 竞赛管理 | contest.edit |
| 题单管理 | training.edit |
| 班级管理 | class.edit |
| 用户管理 | user.view |
| 系统公告 | announcement.manage |
| 提交记录 | submission.view |
| 系统设置 | system.settings |
| 权限点 | system.permission.manage |
| 角色权限 | system.permission.manage |

### 7. 优化 hasPermission 降级逻辑

`lib/permissions/permissions.ts` 中 DB 异常降级路径：移除 TEACHER 硬编码默认集（含 post.*），改为返回 false（fail-closed 更安全）。SYSTEM_ADMIN 仍 fail-safe 返回 true。

### 8. 更新 seed 数据

`prisma/seed.ts`：
- 移除 5 个 `post.*` 权限点
- 新增 4 个权限点（announcement.manage / ai.manage / submission.view / system.logs.view）
- TEACHER 默认权限集：移除 post.*，新增 announcement.manage / ai.manage / submission.view
- STUDENT 默认权限集：移除 post.*

## Impact

- **Affected specs**: `unify-permission-system`（前序 spec，已完成，本 spec 为其后续优化）
- **Affected code**:
  - `lib/permissions/types.ts` — PermissionCode 类型定义
  - `lib/permissions/permissions.ts` — hasPermission 降级逻辑
  - `lib/permissions.ts` — 粗粒度函数（保留但标注为兼容）
  - `lib/api/withPermission.ts` — 权限包装器
  - `hooks/usePermission.ts` — 客户端 hook
  - `components/AdminLayout.tsx` — 后台菜单
  - `app/api/admin/**` — 全部 admin API 路由（30+ 文件）
  - `app/api/auth/me/route.ts` — 返回权限列表
  - `lib/user/service.ts` — getUserProfile 扩展
  - `app/api/comments/recent/route.ts` — 删除
  - `lib/websocket/server.ts` — 清理 post 死代码
  - `lib/validation.ts` — 清理 post 死代码
  - `lib/category/service.ts` — 清理讨论分类
  - `lib/contest-auth.ts` / `lib/solution/permissions.ts` / `lib/class/service.ts` — 改用 hasPermission
  - `prisma/seed.ts` / `prisma/seed-permissions.ts` — 权限点与角色映射
  - 多个服务端组件 page.tsx

## ADDED Requirements

### Requirement: 细粒度权限路由映射
系统 SHALL 按 API 路由所属业务模块映射对应的权限码，而非统一使用 `admin.access`。

#### Scenario: 教师仅有 problem.edit 权限
- **WHEN** TEACHER 用户（有 `admin.access` + `problem.edit`，无 `user.view`）访问 `/api/admin/problems`
- **THEN** 请求通过（拥有 `problem.edit`）
- **WHEN** 同一用户访问 `/api/admin/users`
- **THEN** 返回 403（缺少 `user.view`）

### Requirement: 客户端权限基于后端返回
`usePermission` hook SHALL 基于 `/api/auth/me` 返回的 `permissions` 数组判断，而非本地 role 字符串推断。

#### Scenario: 用户被额外授予权限
- **WHEN** STUDENT 用户被 SYSTEM_ADMIN 在 `/admin/users/[id]/permissions` 额外授予 `contest.create`
- **AND** 该用户在前端调用 `usePermission('contest.create')`
- **THEN** 返回 `true`（因为后端返回的 permissions 数组包含 `contest.create`）

### Requirement: 后台菜单按权限显隐
AdminLayout 中的菜单项 SHALL 仅在用户拥有对应权限时显示。

#### Scenario: 教师无用户管理权限
- **WHEN** TEACHER 用户（无 `user.view`）进入后台
- **THEN** 侧边栏不显示"用户管理"菜单项

### Requirement: 新增权限点
系统 SHALL 支持以下新增权限点：`announcement.manage`、`ai.manage`、`submission.view`、`system.logs.view`。

## MODIFIED Requirements

### Requirement: 权限码定义
`PermissionCode` 类型 SHALL 移除 `post.create`/`post.edit`/`post.delete`/`post.pin`/`post.lock`，新增 `announcement.manage`/`ai.manage`/`submission.view`/`system.logs.view`。

### Requirement: hasPermission 降级策略
DB 异常时 `hasPermission` SHALL 对 SYSTEM_ADMIN 返回 true（fail-safe），对其他角色返回 false（fail-closed），不再使用硬编码默认集。

## REMOVED Requirements

### Requirement: post.* 权限点
**Reason**: 社区系统已移除，帖子相关功能不再存在
**Migration**: 无需迁移，直接删除所有 `post.*` 权限点定义、seed 数据和引用
