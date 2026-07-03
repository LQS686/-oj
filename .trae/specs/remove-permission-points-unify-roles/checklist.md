# Checklist

## 角色体系
- [x] Prisma schema 中 `Permission`/`RolePermission`/`UserPermission` 三个模型已移除
- [x] `User` 模型中 `userPermissions` 关联字段已移除
- [x] `lib/permissions.ts` 提供 `isAdmin(user)` 函数判定 `role === 'ADMIN'`
- [x] `lib/permissions.ts` 提供 `canAccessAdmin(user)`（SYSTEM_ADMIN || ADMIN）
- [x] `lib/permissions.ts` 提供 `canManageSystemSettings(user)`（仅 SYSTEM_ADMIN）
- [x] `lib/permissions.ts` 提供 `canManageContent(user)`（SYSTEM_ADMIN || ADMIN || TEACHER）
- [x] `RoleCode` 类型包含 'ADMIN'
- [x] `getRoleLabel`/`getRoleColor` 包含 ADMIN 选项
- [x] `lib/user/service.ts` 的 `VALID_ADMIN_ROLES` 包含 'ADMIN'

## 权限点系统移除
- [x] `lib/permissions/` 整个目录已删除
- [x] `lib/api/withPermission.ts` 已删除
- [x] `hooks/usePermission.ts` 已删除
- [x] `prisma/seed-permissions.ts` 已删除
- [x] `scripts/cleanup-deprecated-permissions.ts` 已删除
- [x] `app/api/admin/permissions/` 目录已删除
- [x] `app/api/admin/roles/` 目录已删除
- [x] `app/api/admin/users/[id]/permissions/` 目录已删除
- [x] `app/admin/permissions/` 目录已删除
- [x] `app/admin/roles/` 目录已删除
- [x] `app/admin/users/[id]/permissions/` 目录已删除
- [x] `/api/auth/me` 响应不再包含 `permissions` 字段
- [x] `lib/api/auth.ts` 的 `UserData` 不再包含 `permissions` 字段
- [x] `contexts/UserContext.tsx` 不再包含 permissions 相关逻辑

## API 权限校验
- [x] `withApi.admin(handler)` 基于 `canAccessAdmin(user)` 判定（不再调用 hasPermission）
- [x] `withApi.systemAdmin(handler)` 仅允许 SYSTEM_ADMIN
- [x] `lib/api/handler.ts` 的 `withAdmin` 基于 `canAccessAdmin(user)` 判定
- [x] `/api/admin/settings` 使用 `withApi.systemAdmin` 包装
- [x] 其余 `/api/admin/**` 路由使用 `withApi.admin` 包装
- [x] 前台管理 API（创建/编辑题目、竞赛、题单、班级）使用 `canManageContent` 校验
- [x] 全局无残留的 `withPermission` import 或调用
- [x] 全局无残留的 `hasPermission` / `requirePermission` / `getUserPermissions` 调用
- [x] 全局无残留的 `PermissionCode` 类型引用

## Middleware
- [x] `middleware.ts` 基于 JWT payload 的 `role` 拦截 `/admin/*`（仅 SYSTEM_ADMIN + ADMIN 放行）
- [x] TEACHER/STUDENT 访问 `/admin/*` 被重定向到 `/403`

## AdminLayout
- [x] 菜单项不再包含 `permission: PermissionCode` 字段
- [x] 菜单显隐基于 `user.role` 判定（系统设置仅 SYSTEM_ADMIN 可见）
- [x] 权限门逻辑使用 `canAccessAdmin(user)` 而非 `hasPermission('admin.access')`
- [x] AdminLayout 中不再 import `usePermission`

## 客户端组件
- [x] `components/navbar/MobileMenu.tsx` 不再使用 `usePermission`
- [x] `components/navbar/UserMenu.tsx` 不再使用 `usePermission`
- [x] 前台管理页面（`/contests/create`、`/classes` 等）不再使用 `usePermission`，改用角色判定

## 班级角色解耦
- [x] `patchClassMember` 不再包含系统角色同步逻辑（line 274-292 已移除）
- [x] `classApiRoleToSystemRole` 函数已删除
- [x] 班级角色变更不再触发 `prisma.user.update` 修改 `User.role`
- [x] `ClassMember.permissions` JSON 字段保留不变

## 服务层
- [x] `lib/solution/permissions.ts` 使用 `canManageContent` 而非 `hasPermission`
- [x] `lib/contest-auth.ts` 使用 `canManageContent` 而非 `hasPermission`
- [x] `lib/class/service.ts` 使用 `canManageContent` 而非 `hasPermission`
- [x] `app/api/solutions/[id]/route.ts` 使用 `canManageContent` 而非 `role === 'TEACHER'`

## Seed 与迁移
- [x] `prisma/seed.ts` 不再包含 `permissionDefs` 定义
- [x] `prisma/seed.ts` 不再包含 Permission/RolePermission/UserPermission 的 seed 逻辑
- [x] `package.json` 不再包含 `seed:permissions` 脚本入口（如原有）
- [x] 迁移脚本 `scripts/migrate-remove-permissions.ts` 可清空三张权限表

## 文档
- [x] `docs/ROLE_SYSTEM.md` 已更新为四级角色体系（无权限点内容）

## 全局验证
- [x] 全局搜索无 `from '@/lib/permissions/'` 目录 import（仅允许 `from '@/lib/permissions'`）
- [x] `npx tsc --noEmit` 无新增类型错误（剩余 8 个均为预存错误，与权限系统无关）
- [x] `npx prisma validate` 成功（schema 有效）
- [x] SYSTEM_ADMIN 可访问全部后台含系统设置（代码逻辑：withApi.systemAdmin + canAccessAdmin）
- [x] ADMIN 可访问后台（除系统设置外），不能访问 `/admin/settings`（代码逻辑：withApi.systemAdmin 仅 SYSTEM_ADMIN）
- [x] TEACHER 不能访问 `/admin/*`，但可在前台创建/编辑内容（代码逻辑：middleware 拦截 + canManageContent）
- [x] STUDENT 不能创建/编辑/管理任何内容（代码逻辑：canManageContent 返回 false）
- [x] 班级内授予教师角色不改变用户系统角色（代码逻辑：patchClassMember 已移除同步）
