# Tasks

## Phase 1：权限点定义与类型更新

- [ ] **Task 1.1**：更新 `lib/permissions/types.ts` 中的 `PermissionCode` 类型
  - [ ] SubTask 1.1.1：移除 `post.create`/`post.edit`/`post.delete`/`post.pin`/`post.lock`
  - [ ] SubTask 1.1.2：新增 `announcement.manage`/`ai.manage`/`submission.view`/`system.logs.view`
- [ ] **Task 1.2**：优化 `lib/permissions/permissions.ts` 降级逻辑
  - [ ] SubTask 1.2.1：移除 DB 异常降级路径中的 TEACHER 硬编码默认集（含 post.*）
  - [ ] SubTask 1.2.2：DB 异常时对非 SYSTEM_ADMIN 用户返回 false（fail-closed）

## Phase 2：移除 post 相关死代码

- [ ] **Task 2.1**：删除断裂路由 `app/api/comments/recent/route.ts`（引用不存在的 `@/lib/post/service`）
- [ ] **Task 2.2**：清理 `lib/websocket/server.ts` 中 `join_post`/`leave_post`/`post:*` 事件和房间逻辑
- [ ] **Task 2.3**：清理 `lib/validation.ts` 中 `validatePostTitle`/`validatePostContent`/`validateCommentContent` 函数
- [ ] **Task 2.4**：清理 `lib/category/service.ts` 中讨论分类种子数据（综合讨论/题解分享/求助问答/技术交流）
- [ ] **Task 2.5**：清理 `app/user/[id]/page.tsx` 中 `user._count?.posts` 展示残留
- [ ] **Task 2.6**：清理权限管理页面中 `post: '帖子'` 模块标签
  - [ ] SubTask 2.6.1：`app/admin/permissions/page.tsx`
  - [ ] SubTask 2.6.2：`app/admin/roles/page.tsx`
  - [ ] SubTask 2.6.3：`app/admin/users/[id]/permissions/page.tsx`
- [ ] **Task 2.7**：清理 `prisma/seed.ts` 中 `db.collection('Post')` 直接操作 MongoDB 的种子数据
- [ ] **Task 2.8**：清理 `types/models.ts` 中 `User._count` 接口的 `posts`/`comments` 字段（如已无引用）

## Phase 3：admin API 路由按模块映射细粒度权限

- [x] **Task 3.1**：题目模块路由改权限映射
  - [x] SubTask 3.1.1：`app/api/admin/problems/route.ts` — GET 改 `problem.edit`，POST 改 `problem.create`
  - [x] SubTask 3.1.2：`app/api/admin/problems/[id]/route.ts` — GET/PATCH/PUT 改 `problem.edit`，DELETE 改 `problem.delete`（同时移除 `ensureAdmin` 辅助函数和 `PermissionUser` 类型导入）
  - [x] SubTask 3.1.3：`app/api/admin/problems/batch/route.ts` — 改 `problem.edit`
  - [x] SubTask 3.1.4：`app/api/admin/problems/batch-source/route.ts` — 改 `problem.edit`
  - [x] SubTask 3.1.5：`app/api/admin/problems/export/route.ts` — 改 `problem.edit`
  - [x] SubTask 3.1.6：`app/api/admin/problems/review/route.ts` — 改 `problem.review`
  - [x] SubTask 3.1.7：`app/api/admin/problems/[id]/verify/route.ts` — 改 `problem.review`（保留 `isAdmin: isSystemAdmin(user)` 业务逻辑传值）
  - [x] SubTask 3.1.8：`app/api/admin/problems/[id]/verification-logs/route.ts` — 改 `problem.review`
  - [x] SubTask 3.1.9：`app/api/admin/problems/[id]/regenerate-solution/route.ts` — 改 `problem.edit`（同步更新注释）
- [x] **Task 3.2**：竞赛模块路由改权限映射
  - [x] SubTask 3.2.1：`app/api/admin/contests/route.ts` — GET 改 `contest.edit`，POST 改 `contest.create`
  - [x] SubTask 3.2.2：`app/api/admin/contests/[id]/route.ts` — GET/PATCH 改 `contest.edit`，DELETE 改 `contest.delete`（移除 `ensureAdmin` 函数）
- [x] **Task 3.3**：班级模块路由改权限映射
  - [x] SubTask 3.3.1：`app/api/admin/classes/route.ts` — GET 改 `class.edit`
  - [x] SubTask 3.3.2：`app/api/admin/classes/[id]/route.ts` — PATCH 改 `class.edit`，DELETE 改 `class.delete`
- [x] **Task 3.4**：训练模块路由改权限映射
  - [x] SubTask 3.4.1：`app/api/admin/trainings/route.ts` — GET 改 `training.edit`
- [x] **Task 3.5**：用户模块路由改权限映射
  - [x] SubTask 3.5.1：`app/api/admin/users/route.ts` — GET 改 `user.view`
  - [x] SubTask 3.5.2：`app/api/admin/users/[id]/route.ts` — PATCH 改 `user.edit`，DELETE 改 `user.delete`
  - [x] SubTask 3.5.3：`app/api/admin/users/[id]/permissions/route.ts` — GET/PUT 改 `user.role.assign`
  - [x] SubTask 3.5.4：`app/api/admin/users/batch-update/route.ts` — 改 `user.edit`
  - [x] SubTask 3.5.5：`app/api/admin/users/batch-register/route.ts` — 改 `user.edit`
  - [x] SubTask 3.5.6：`app/api/admin/users/batch-delete/route.ts` — 改 `user.delete`
- [x] **Task 3.6**：公告模块路由改权限映射
  - [x] SubTask 3.6.1：`app/api/admin/announcements/route.ts` — GET/POST 改 `announcement.manage`
  - [x] SubTask 3.6.2：`app/api/admin/announcements/[id]/route.ts` — PATCH/DELETE 改 `announcement.manage`
- [x] **Task 3.7**：系统模块路由改权限映射
  - [x] SubTask 3.7.1：`app/api/admin/settings/route.ts` — GET/PUT 改 `system.settings`
  - [x] SubTask 3.7.2：`app/api/admin/permissions/route.ts` — GET 改 `system.permission.manage`
  - [x] SubTask 3.7.3：`app/api/admin/roles/route.ts` — GET/PUT 改 `system.permission.manage`（保留 `if (role === 'SYSTEM_ADMIN')` 安全保护逻辑）
  - [x] SubTask 3.7.4：`app/api/admin/submissions/route.ts` — GET 改 `submission.view`
  - [x] SubTask 3.7.5：`app/api/admin/logs/source-changes/route.ts` — GET 改 `system.logs.view`
  - [x] SubTask 3.7.6：`app/api/admin/dashboard/route.ts` — 保留 `admin.access` 不变（使用内部 isSystemAdmin 检查）
- [x] **Task 3.8**：AI 模块路由改权限映射
  - [x] SubTask 3.8.1：`app/api/admin/ai/config/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.2：`app/api/admin/ai/test/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.3：`app/api/admin/ai/generate/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.4：`app/api/admin/ai/models/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.5：`app/api/admin/ai/models/[id]/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.6：`app/api/admin/ai/providers/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.7：`app/api/admin/ai/providers/[id]/route.ts` — 改 `ai.manage`
  - [x] SubTask 3.8.8：`app/api/admin/ai/providers/[id]/discover-models/route.ts` — 改 `ai.manage`

## Phase 4：服务端组件改用 hasPermission

- [x] **Task 4.1**：`app/contests/create/page.tsx` — `canCreateContest` 改为 `hasPermission(user, 'contest.create')`
  - 客户端组件，使用 `useState` + `useEffect` + `cancelled` flag 模式调用 `await hasPermission(user, 'contest.create')`，无权限时 toast 提示并跳转
- [x] **Task 4.2**：`app/contests/[id]/page.tsx` — `payload.role === 'SYSTEM_ADMIN'` 改为 `hasPermission(payload, 'contest.edit')`
  - 服务端组件，直接 `await hasPermission({ id: payload.userId, role: payload.role }, 'contest.edit')`（JWT payload userId → id 适配）
- [x] **Task 4.3**：`app/contests/[id]/layout.tsx` — `user.role === 'SYSTEM_ADMIN'` 改为 `hasPermission(user, 'contest.edit')`
  - 服务端组件，`await hasPermission({ id: user.userId, role: user.role }, 'contest.edit')`
- [x] **Task 4.4**：`app/classes/page.tsx` — `canCreateClass` 改为 `hasPermission(user, 'class.create')`
  - 客户端组件，`canCreate` state + async useEffect；3 处 `canCreateClass(user)` 调用点全部替换为 `canCreate` 变量
- [x] **Task 4.5**：`app/classes/[id]/assignments/[assignmentId]/page.tsx` — `isAdmin || isTeacher` 改为 `hasPermission(user, 'class.assignment.manage')`
  - 客户端组件，`canManage` state + async useEffect；`isClassAdminApiRole(userRole) || isAdmin(user) || isTeacher(user)` → `isClassAdminApiRole(userRole) || canManage`
- [x] **Task 4.6**：`app/problems/[id]/solutions/[solutionId]/page.tsx` — `role === 'SYSTEM_ADMIN' || role === 'TEACHER'` 改为 `hasPermission(user, 'problem.edit')`
  - 客户端组件，`canEditPerm` state + async useEffect；`(user.id === solution.authorId || user.role === 'SYSTEM_ADMIN' || user.role === 'TEACHER')` → `(user.id === solution.authorId || canEditPerm)`
- [x] **Task 4.7**：`app/problems/[id]/solutions/[solutionId]/edit/page.tsx` — `role === 'SYSTEM_ADMIN'` 改为 `hasPermission(user, 'problem.edit')`
  - 客户端组件，`canEditPerm` state + async useEffect；`const canEdit = isAuthor || canEditPerm`（移除 `isAdmin`/`isTeacher` 变量）

## Phase 5：服务层改用 hasPermission

- [x] **Task 5.1**：`lib/contest-auth.ts:58` — `role === 'SYSTEM_ADMIN'` 改为 `hasPermission(currentUser, 'contest.edit')`
  - `const isAdmin = await hasPermission(currentUser ? { id: currentUser.userId, role: currentUser.role } : null, 'contest.edit') || contest.authorId === currentUser?.userId`
- [x] **Task 5.2**：`lib/solution/permissions.ts` — `role === 'SYSTEM_ADMIN' || 'TEACHER'` 改为 `hasPermission(user, 'problem.edit')`（4 处）
  - 原 4 处硬编码（`decideSolutionView` 与 `canViewSolutions` 各 2 处 ADMIN/TEACHER 分支）合并为 2 处统一 `hasPermission(user, 'problem.edit')` 调用；`decideSolutionView` 由同步改为 async；测试文件 `scripts/test-5-solution-permissions.ts` 同步修复（mock `userPermission.findUnique`/`rolePermission.findFirst`，TEACHER 用例 reason 由 'TEACHER' 改为 'ADMIN'）
- [x] **Task 5.3**：`lib/class/service.ts:609-610` — `role === 'SYSTEM_ADMIN' || 'TEACHER'` 改为 `hasPermission(u, 'class.edit')`
  - `getUserIsAdmin` 内 `prisma.user.findUnique` 查出 `{ id, role }` 后 `return hasPermission(u, 'class.edit')`

## Phase 6：客户端权限系统改造

- [x] **Task 6.1**：扩展 `/api/auth/me` 返回用户有效权限列表
  - [x] SubTask 6.1.1：在 `lib/permissions/permissions.ts` 中新增 `getUserPermissions(user)` 函数，返回 `string[]`（含缓存+降级）
  - [x] SubTask 6.1.2：`app/api/auth/me/route.ts` 中并行调用并将 `permissions` 加入响应
- [x] **Task 6.2**：改造 `hooks/usePermission.ts`
  - [x] SubTask 6.2.1：移除 `TEACHER_PREFIXES`/`TEACHER_EXACT`/`STUDENT_ALLOWED` 硬编码逻辑
  - [x] SubTask 6.2.2：从 UserContext 读取 `user.permissions` 数组（复用 /api/auth/me 拉取，避免重复请求）
- [x] **Task 6.3**：改造 `components/AdminLayout.tsx` 菜单按权限显隐
  - [x] SubTask 6.3.1：菜单项数据结构增加 `permission` 字段（13 项全部含 permission）
  - [x] SubTask 6.3.2：使用 `usePermission()` 的 `hasPermission` 过滤菜单项并丢弃空分组
- [x] **Task 6.4**：清理 `components/navbar/UserMenu.tsx` 和 `MobileMenu.tsx` 中 `isAdmin`/`canAccessAdmin` 硬编码，改用 `usePermission('admin.access')`

## Phase 7：seed 数据更新

- [x] **Task 7.1**：更新 `prisma/seed.ts`
  - [x] SubTask 7.1.1：移除 5 个 `post.*` 权限点定义
  - [x] SubTask 7.1.2：新增 4 个权限点（announcement.manage / ai.manage / submission.view / system.logs.view）
  - [x] SubTask 7.1.3：TEACHER 默认权限集移除 post.*，新增 announcement.manage / ai.manage / submission.view
  - [x] SubTask 7.1.4：STUDENT 默认权限集移除 post.*
- [x] **Task 7.2**：更新 `prisma/seed-permissions.ts`（已同步上述变更）

## Phase 8：验证

- [x] **Task 8.1**：运行 `npx tsc --noEmit` 确认无新增类型错误（仅预存无关错误）
- [x] **Task 8.2**：Grep 确认无残留 `post.` 权限码引用（5 文件全部无匹配）
- [x] **Task 8.3**：Grep 确认无残留 `@/lib/post/service` import（源码无残留）
- [x] **Task 8.4**：Grep 确认 admin 路由中 `admin.access` 仅剩 dashboard 路由
- [x] **Task 8.5**：Grep 确认服务端组件和服务层中无残留 `role === 'SYSTEM_ADMIN'` 业务判断（仅保留 lib/permissions 自身和 lib/user/service.ts 安全硬卡）

# Task Dependencies

- Phase 2 依赖 Phase 1（先更新类型定义再删引用）
- Phase 3 依赖 Phase 1（新增权限码需先在类型中定义）
- Phase 4/5 依赖 Phase 1（使用 hasPermission 需权限码已定义）
- Phase 6 依赖 Phase 3（客户端权限需与 API 权限映射一致）
- Phase 7 依赖 Phase 1（seed 数据需与类型定义一致）
- Phase 8 依赖所有前序
- Phase 2/3/4/5/7 之间无强依赖，可并行
