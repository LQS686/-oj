# Checklist

## Phase 1：权限点定义与类型更新

- [ ] `lib/permissions/types.ts` 中 `PermissionCode` 已移除 `post.create`/`post.edit`/`post.delete`/`post.pin`/`post.lock`
- [ ] `lib/permissions/types.ts` 中 `PermissionCode` 已新增 `announcement.manage`/`ai.manage`/`submission.view`/`system.logs.view`
- [ ] `lib/permissions/permissions.ts` DB 异常降级路径已移除 TEACHER 硬编码默认集
- [ ] `lib/permissions/permissions.ts` DB 异常时对非 SYSTEM_ADMIN 用户返回 false（fail-closed）

## Phase 2：移除 post 相关死代码

- [ ] `app/api/comments/recent/route.ts` 已删除（断裂 import）
- [ ] `lib/websocket/server.ts` 中 `join_post`/`leave_post`/`post:*` 事件和房间逻辑已清理
- [ ] `lib/validation.ts` 中 `validatePostTitle`/`validatePostContent`/`validateCommentContent` 已删除
- [ ] `lib/category/service.ts` 中讨论分类种子数据已清理
- [ ] `app/user/[id]/page.tsx` 中 `user._count?.posts` 展示残留已清理
- [ ] `app/admin/permissions/page.tsx` 中 `post: '帖子'` 模块标签已移除
- [ ] `app/admin/roles/page.tsx` 中 `post: '帖子'` 模块标签已移除
- [ ] `app/admin/users/[id]/permissions/page.tsx` 中 `post: '帖子'` 模块标签已移除
- [ ] `prisma/seed.ts` 中 `db.collection('Post')` 种子数据已清理
- [ ] `types/models.ts` 中 `User._count` 的 `posts` 字段已清理（如无其他引用）

## Phase 3：admin API 路由按模块映射细粒度权限

- [x] `/api/admin/problems` GET 使用 `problem.edit`，POST 使用 `problem.create`
- [x] `/api/admin/problems/[id]` GET/PATCH/PUT 使用 `problem.edit`，DELETE 使用 `problem.delete`
- [x] `/api/admin/problems/batch` 使用 `problem.edit`
- [x] `/api/admin/problems/batch-source` 使用 `problem.edit`
- [x] `/api/admin/problems/export` 使用 `problem.edit`
- [x] `/api/admin/problems/review` 使用 `problem.review`
- [x] `/api/admin/problems/[id]/verify` 使用 `problem.review`
- [x] `/api/admin/problems/[id]/verification-logs` 使用 `problem.review`
- [x] `/api/admin/problems/[id]/regenerate-solution` 使用 `problem.edit`
- [x] `/api/admin/contests` GET 使用 `contest.edit`，POST 使用 `contest.create`
- [x] `/api/admin/contests/[id]` GET/PATCH 使用 `contest.edit`，DELETE 使用 `contest.delete`
- [x] `/api/admin/classes` GET 使用 `class.edit`
- [x] `/api/admin/classes/[id]` PATCH 使用 `class.edit`，DELETE 使用 `class.delete`
- [x] `/api/admin/trainings` GET 使用 `training.edit`
- [x] `/api/admin/users` GET 使用 `user.view`
- [x] `/api/admin/users/[id]` PATCH 使用 `user.edit`，DELETE 使用 `user.delete`
- [x] `/api/admin/users/[id]/permissions` GET/PUT 使用 `user.role.assign`
- [x] `/api/admin/users/batch-update` 使用 `user.edit`
- [x] `/api/admin/users/batch-register` 使用 `user.edit`
- [x] `/api/admin/users/batch-delete` 使用 `user.delete`
- [x] `/api/admin/announcements` GET/POST 使用 `announcement.manage`
- [x] `/api/admin/announcements/[id]` PATCH/DELETE 使用 `announcement.manage`
- [x] `/api/admin/settings` GET/PUT 使用 `system.settings`
- [x] `/api/admin/permissions` GET 使用 `system.permission.manage`
- [x] `/api/admin/roles` GET/PUT 使用 `system.permission.manage`
- [x] `/api/admin/submissions` GET 使用 `submission.view`
- [x] `/api/admin/logs/source-changes` GET 使用 `system.logs.view`
- [x] `/api/admin/dashboard` GET 保留 `admin.access`（内部 isSystemAdmin 检查）
- [x] `/api/admin/ai/**` 全部使用 `ai.manage`
- [x] admin 路由中无残留的裸 `isSystemAdmin(user)` 内部判断（dashboard 按设计保留；verify 仅作业务逻辑传值）

## Phase 4：服务端组件改用 hasPermission

- [x] `app/contests/create/page.tsx` 使用 `hasPermission(user, 'contest.create')` 替代 `canCreateContest`
- [x] `app/contests/[id]/page.tsx` 使用 `hasPermission` 替代 `payload.role === 'SYSTEM_ADMIN'`
- [x] `app/contests/[id]/layout.tsx` 使用 `hasPermission` 替代 `user.role === 'SYSTEM_ADMIN'`
- [x] `app/classes/page.tsx` 使用 `hasPermission(user, 'class.create')` 替代 `canCreateClass`
- [x] `app/classes/[id]/assignments/[assignmentId]/page.tsx` 使用 `hasPermission` 替代 `isAdmin || isTeacher`
- [x] `app/problems/[id]/solutions/[solutionId]/page.tsx` 使用 `hasPermission` 替代 `role === 'SYSTEM_ADMIN' || role === 'TEACHER'`
- [x] `app/problems/[id]/solutions/[solutionId]/edit/page.tsx` 使用 `hasPermission` 替代 `role === 'SYSTEM_ADMIN'`

## Phase 5：服务层改用 hasPermission

- [x] `lib/contest-auth.ts` 使用 `hasPermission` 替代 `role === 'SYSTEM_ADMIN'`
- [x] `lib/solution/permissions.ts` 使用 `hasPermission` 替代 `role === 'SYSTEM_ADMIN' || 'TEACHER'`（4 处）
- [x] `lib/class/service.ts` 使用 `hasPermission` 替代 `role === 'SYSTEM_ADMIN' || 'TEACHER'`
- [x] `lib/user/service.ts` 中 `target.role === 'SYSTEM_ADMIN'` 安全硬卡保留不动

## Phase 6：客户端权限系统改造

- [x] `/api/auth/me` 响应中包含 `permissions: string[]` 字段
- [x] `getUserPermissions(user)` 函数已实现并缓存（30s TTL，含 DB 异常降级）
- [x] `hooks/usePermission.ts` 已移除 `TEACHER_PREFIXES`/`TEACHER_EXACT`/`STUDENT_ALLOWED` 硬编码
- [x] `hooks/usePermission.ts` 从 UserContext 读取 `user.permissions` 数组（复用 /api/auth/me 拉取）
- [x] `components/AdminLayout.tsx` 菜单项按 `usePermission` 显隐（13 项均含 permission 字段）
- [x] `components/navbar/UserMenu.tsx` 使用 `usePermission('admin.access')` 替代 `canAccessAdmin`
- [x] `components/navbar/MobileMenu.tsx` 使用 `usePermission('admin.access')` 替代 `canAccessAdmin`

## Phase 7：seed 数据更新

- [x] `prisma/seed.ts` 已移除 5 个 `post.*` 权限点
- [x] `prisma/seed.ts` 已新增 4 个权限点（announcement.manage / ai.manage / submission.view / system.logs.view）
- [x] `prisma/seed.ts` TEACHER 默认权限集已移除 post.*，新增 announcement.manage / ai.manage / submission.view
- [x] `prisma/seed.ts` STUDENT 默认权限集已移除 post.*
- [x] `prisma/seed-permissions.ts` 已同步上述变更

## Phase 8：验证

- [x] `npx tsc --noEmit` 无新增类型错误（仅 .next 缓存 + announcements 预存类型收窄问题，均与权限改造无关）
- [x] Grep `post.` 在 `lib/permissions/types.ts`、`hooks/usePermission.ts`、`lib/permissions/permissions.ts`、`prisma/seed.ts`、`prisma/seed-permissions.ts` 中无残留
- [x] Grep `@/lib/post/service` 全项目源码无残留 import
- [x] Grep `admin.access` 在 `app/api/admin/` 中仅出现在 `/api/admin/dashboard/route.ts`
- [x] Grep `isSystemAdmin(user)` 在 `app/api/admin/**` 中仅剩 verify 路由的业务传值（dashboard 已改用 withApi.admin）
- [x] Grep `role === 'SYSTEM_ADMIN'` 在服务端组件和服务层中仅保留 `lib/permissions` 自身和 `lib/user/service.ts` 安全硬卡
- [x] `usePermission` hook 已移除 TEACHER_PREFIXES/TEACHER_EXACT/STUDENT_ALLOWED 硬编码
- [x] `/api/auth/me` 响应包含 `permissions: string[]` 字段
- [x] AdminLayout 13 个菜单项均含 `permission` 字段并按 `usePermission` 显隐
- [x] `getUserPermissions` 函数已在 `lib/permissions/permissions.ts` 中定义并导出
