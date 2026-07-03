# Tasks

- [x] Task 1: 简化 Prisma schema，移除权限点模型
  - [x] SubTask 1.1: 移除 `Permission`、`RolePermission`、`UserPermission` 三个模型定义
  - [x] SubTask 1.2: 移除 `User` 模型中的 `userPermissions UserPermission[]` 关联字段
  - [x] SubTask 1.3: 执行 `prisma generate` 确认 schema 无误（prisma validate 通过）

- [x] Task 2: 重写 `lib/permissions.ts` 为纯角色判定入口
  - [x] SubTask 2.1: 移除所有 `hasPermission`/`requirePermission`/`PermissionCode`/`PermissionDeniedError` 的 re-export
  - [x] SubTask 2.2: 保留 `isSystemAdmin`/`isTeacher`/`isStudent`，新增 `isAdmin(user)`（role === 'ADMIN'）
  - [x] SubTask 2.3: 新增组合判定函数：`canAccessAdmin(user)`（SYSTEM_ADMIN || ADMIN）、`canManageSystemSettings(user)`（仅 SYSTEM_ADMIN）、`canManageContent(user)`（SYSTEM_ADMIN || ADMIN || TEACHER）
  - [x] SubTask 2.4: 更新 `User`/`RoleUser` 接口，`RoleCode` 类型加入 'ADMIN'
  - [x] SubTask 2.5: 更新 `getRoleLabel`/`getRoleColor` 加入 ADMIN 选项

- [x] Task 3: 删除权限点系统核心代码
  - [x] SubTask 3.1: 删除 `lib/permissions/` 整个目录（index.ts / permissions.ts / guard.ts / types.ts / role.ts）
  - [x] SubTask 3.2: 删除 `lib/api/withPermission.ts`
  - [x] SubTask 3.3: 删除 `hooks/usePermission.ts`
  - [x] SubTask 3.4: 删除 `prisma/seed-permissions.ts`
  - [x] SubTask 3.5: 删除 `scripts/cleanup-deprecated-permissions.ts`

- [x] Task 4: 改造 API 包装器为角色判定
  - [x] SubTask 4.1: `lib/api/withApi.ts` — `withApi.admin(handler)` 改为检查 `canAccessAdmin(user)`（移除 hasPermission 调用）
  - [x] SubTask 4.2: `lib/api/withApi.ts` — 新增 `withApi.systemAdmin(handler)`（仅 SYSTEM_ADMIN）
  - [x] SubTask 4.3: `lib/api/handler.ts` — `withAdmin(handler)` 改为检查 `canAccessAdmin(user)`（移除动态 import hasPermission）
  - [x] SubTask 4.4: 移除两个文件中对 `@/lib/permissions/` 的 import，改为从 `@/lib/permissions` 导入角色判定函数

- [x] Task 5: 更新认证与客户端权限链路
  - [x] SubTask 5.1: `app/api/auth/me/route.ts` — 移除 `getUserPermissions` 调用与 `permissions` 字段返回
  - [x] SubTask 5.2: `lib/api/auth.ts` — 移除 `UserData.permissions` 字段
  - [x] SubTask 5.3: `contexts/UserContext.tsx` — 移除 permissions 相关逻辑
  - [x] SubTask 5.4: `middleware.ts` — `/admin/*` 拦截改为基于 JWT payload 的 role（仅 SYSTEM_ADMIN + ADMIN 放行，其余 302 → /403）

- [x] Task 6: 删除权限管理页面与 API
  - [x] SubTask 6.1: 删除 `app/api/admin/permissions/` 目录
  - [x] SubTask 6.2: 删除 `app/api/admin/roles/` 目录
  - [x] SubTask 6.3: 删除 `app/api/admin/users/[id]/permissions/` 目录
  - [x] SubTask 6.4: 删除 `app/admin/permissions/` 目录
  - [x] SubTask 6.5: 删除 `app/admin/roles/` 目录
  - [x] SubTask 6.6: 删除 `app/admin/users/[id]/permissions/` 目录

- [x] Task 7: 迁移所有 `/api/admin/**` 路由的权限校验
  - [x] SubTask 7.1: `app/api/admin/settings/route.ts` — 改为 `withApi.systemAdmin`
  - [x] SubTask 7.2: 其余所有 `/api/admin/**` 路由（31 个文件）— 将 `withPermission('xxx')` 替换为 `withApi.admin`，移除 withPermission import
  - [x] SubTask 7.3: 验证无残留的 `withPermission` import 与调用（Grep 确认无结果）

- [x] Task 8: 迁移前台管理 API 与页面的权限校验
  - [x] SubTask 8.1: 前台管理 API（`/api/contests` POST、`/api/problems` POST、`/api/trainings` 等）— 改为 `canManageContent(user)` 校验
  - [x] SubTask 8.2: 前台管理页面（`/contests/create`、`/classes`、`/training` 等）— 移除 `usePermission`，改用 `canManageContent(user)` 等判定
  - [x] SubTask 8.3: `components/navbar/MobileMenu.tsx`、`components/navbar/UserMenu.tsx` — 移除 `usePermission`，改用角色判定

- [x] Task 9: 改造 AdminLayout 菜单为角色判定
  - [x] SubTask 9.1: 移除菜单项的 `permission: PermissionCode` 字段
  - [x] SubTask 9.2: 改为基于 `user.role` 的菜单显隐：系统设置菜单仅 SYSTEM_ADMIN 可见；其余后台菜单 SYSTEM_ADMIN + ADMIN 可见
  - [x] SubTask 9.3: 权限门逻辑从 `hasPermission('admin.access')` 改为 `canAccessAdmin(user)`

- [x] Task 10: 班级角色与系统角色解耦
  - [x] SubTask 10.1: `lib/class/service.ts` — 移除 `patchClassMember` 中系统角色同步逻辑
  - [x] SubTask 10.2: `lib/class/service.ts` — 删除 `classApiRoleToSystemRole` 函数
  - [x] SubTask 10.3: 验证班级角色变更不再触发 `prisma.user.update` 修改 role

- [x] Task 11: 更新用户服务与角色校验
  - [x] SubTask 11.1: `lib/user/service.ts` — `VALID_ADMIN_ROLES` / `assertValidRole` 加入 'ADMIN'
  - [x] SubTask 11.2: `lib/user/service.ts` — 批量角色相关常量（`BATCH_VALID_ROLES`/`getBatchRoleDefaults`）加入 ADMIN
  - [x] SubTask 11.3: `app/admin/users/page.tsx` — `ROLE_DISPLAY` 映射加入 ADMIN 选项
  - [x] SubTask 11.4: `app/api/admin/users/[id]/route.ts` — 角色更新接口的 valid roles 加入 ADMIN，改用 withApi.admin

- [x] Task 12: 改造服务层权限判定
  - [x] SubTask 12.1: `lib/solution/permissions.ts` — `hasPermission(user, 'problem.edit')` 改为 `canManageContent(user)`
  - [x] SubTask 12.2: `lib/contest-auth.ts` — `hasPermission(currentUser, 'contest.edit')` 改为 `canManageContent(user)`
  - [x] SubTask 12.3: `lib/class/service.ts` — `hasPermission(u, 'class.edit')` 改为 `canManageContent(user)`
  - [x] SubTask 12.4: `app/api/solutions/[id]/route.ts` — `dbUser?.role === 'TEACHER'` 改为 `canManageContent` 判定

- [x] Task 13: 更新 seed 数据
  - [x] SubTask 13.1: `prisma/seed.ts` — 移除 `permissionDefs` 定义与 Permission/RolePermission/UserPermission 的 seed 逻辑
  - [x] SubTask 13.2: `prisma/seed.ts` — 移除清空 Permission/RolePermission/UserPermission 集合的代码
  - [x] SubTask 13.3: `package.json` — 确认无 `seed:permissions` 脚本入口

- [x] Task 14: 创建数据迁移脚本与文档更新
  - [x] SubTask 14.1: 创建一次性迁移脚本 `scripts/migrate-remove-permissions.ts`：清空 Permission/RolePermission/UserPermission 集合
  - [x] SubTask 14.2: 更新 `docs/ROLE_SYSTEM.md` 为四级角色体系文档（移除权限点相关内容）

- [x] Task 15: 全局清理与验证
  - [x] SubTask 15.1: 全局搜索确认无残留的 `hasPermission`/`withPermission`/`usePermission`/`PermissionCode`/`getUserPermissions`/`requirePermission` 引用（Grep 确认无结果）
  - [x] SubTask 15.2: 全局搜索确认无残留的 `from '@/lib/permissions/'` 目录 import（Grep 确认无结果）
  - [x] SubTask 15.3: 执行 `npx tsc --noEmit` 确认无新增类型错误（剩余 8 个均为预存错误）
  - [x] SubTask 15.4: 执行 `npx prisma validate` 确认 schema 无误（通过）

# Task Dependencies
- [Task 7] [Task 8] [Task 9] 依赖 [Task 2] [Task 4]（角色判定函数与包装器就绪后才能替换）
- [Task 12] 依赖 [Task 2]（需要 canManageContent 等函数）
- [Task 5] 依赖 [Task 3]（删除 lib/permissions/ 后 me 路由不能再调用 getUserPermissions）
- [Task 14] SubTask 14.1 依赖 [Task 1]（schema 改完后迁移脚本才能正确编写）
- [Task 3] [Task 6] 可与 [Task 2] 并行（互不依赖）
- [Task 10] [Task 11] [Task 13] 相互独立，可并行
