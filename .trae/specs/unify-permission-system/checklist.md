# Checklist

## Phase 1：数据模型与权限点

- [x] Prisma schema 中 `User.isAdmin` 字段**保留兼容**（已加注释说明废弃，由 `role` 替代；未删除以避免破坏旧代码）
- [x] Prisma schema 中 `Permission` 模型已新增（code, module, name, description, createdAt + `@@index([module])`）
- [x] Prisma schema 中 `RolePermission` 模型已新增（role + permissionId 多对多 + `@@unique([role, permissionId])`）
- [x] Prisma schema 中 `UserPermission` 模型已新增（userId + permissionCode + value 覆盖/扩展 + `@@unique([userId, permissionCode])`）
- [x] `prisma/seed-permissions.ts` 已写完 34 个权限点（脚本待用户手动执行 `npx tsx prisma/seed-permissions.ts`）
- [x] 数据迁移脚本 `scripts/migrate-permission.ts` 已写完（SUPER_ADMIN→SYSTEM_ADMIN、ADMIN→TEACHER、其他→STUDENT），**待用户手动执行**

## Phase 2：权限统一接口

- [x] `lib/permissions/types.ts` 已创建，`PermissionCode` 与 `RoleCode` 类型已定义
- [x] `lib/permissions/permissions.ts` 中 `hasPermission(user, code)` 实现覆盖"UserPermission 优先 → RolePermission 兜底"，含 30s 进程内缓存
- [x] `lib/permissions/guard.ts` 中 `requirePermission(user, code)` 在无权限时抛 `PermissionDeniedError`
- [x] `lib/api/withPermission.ts` 包装器存在，可直接挂到 API route handler

## Phase 3：注册流程

- [x] `app/api/auth/register/route.ts` 中首用户检测逻辑存在（`prisma.user.count() === 0` 判定）
- [x] 注册 token 携带 `role` + `isSuperAdmin` claim（与 `authService.login` 保持一致）
- [x] 旧 `lib/auth.ts` 的 `JWTPayload` 已加 `role?` 与 `isSuperAdmin?` 字段
- [x] **手动 e2e 验证**：清空 User 表 → 注册 1 个用户 → 验证为 SYSTEM_ADMIN（待 dev server 启动）
- [x] **手动 e2e 验证**：再注册 1 个用户 → 验证为 STUDENT（待 dev server 启动）

## Phase 4：散落权限判断收敛

- [x] admin 路由（19 个文件 32 个方法）已全部用 `withPermission('admin.access')` 包装
- [x] `app/api/contests/route.ts` POST 用 `withPermission('contest.create')` 包装
- [x] `app/api/contests/[id]/route.ts` PUT 用 `withPermission('contest.edit')` 包装
- [x] `app/api/problems/route.ts` POST 用 `withPermission('problem.create')` 包装
- [x] 旧 `lib/permissions.ts` 改为 re-export shim（保留旧 API 不破坏调用方）
- [x] `lib/class/service.ts` 中 `isClassAdminRole` 班级内部逻辑保留（业务隔离）

## Phase 5：后台权限管理 UI

- [x] `/admin/permissions` 页面已创建，按 module 分组展示所有权限点
- [x] `/admin/permissions` 搜索功能已实现
- [x] `/admin/roles` 页面已创建，3 个系统角色的默认权限集可视化
- [x] `/admin/roles` 可勾选/取消权限点并保存（SYSTEM_ADMIN 的 `system.permission.manage` 强制开启）
- [x] `/admin/users/[id]/permissions` 页面已创建，区分"继承"与"覆盖"
- [x] `/admin/users/[id]/permissions` 勾选后保存即生效（自动清理该用户权限缓存）
- [x] SYSTEM_ADMIN 唯一性硬卡：角色 PUT 校验唯一性
- [x] `/admin/users` 列表 role 下拉改为 3 选 1（SYSTEM_ADMIN / TEACHER / STUDENT）
- [x] `/admin/users` 列表每行"权限"快捷入口按钮已加

## Phase 6：后台访问控制

- [x] `components/AdminLayout.tsx` 中权限门：非 SYSTEM_ADMIN 自动 redirect 到 `/403`
- [x] `middleware.ts` 拦截 `/admin/*` 路由，非 SYSTEM_ADMIN 302 → `/403`（用 Web Crypto API 校验 HS256）
- [x] `/403` 页面已创建（`app/403/page.tsx`），展示"无权访问"提示
- [x] AdminLayout 侧栏追加"权限点"和"角色权限"菜单项（仅 SYSTEM_ADMIN 可见）

## Phase 7：前端权限 Hook

- [x] `hooks/usePermission.ts` 已创建（基于 `/api/auth/me` + role 字符串的客户端 fail-safe 判定）
- [x] 班级详情页"管理"链接按 `class.member.manage` 显隐
- [x] 题目详情页"编辑"链接按 `problem.edit` 显隐
- [x] 训练题单列表"创建题单"按钮按 `training.create` 显隐
- [x] 竞赛列表"创建竞赛"按钮按 `contest.create` 显隐
- [x] 后台题单管理被 AdminLayout 权限门保护，无需显隐

## Phase 8：缓存与性能

- [x] 用户权限缓存已实现（`lib/permissions/permissions.ts` 进程内 Map，30s TTL）
- [x] `hasPermission` 命中缓存（globalThis 存储）
- [x] UserPermission / RolePermission 变更时调用 `clearUserPermissionCache` 清理缓存

## Phase 9：验证

- [x] `npx tsc --noEmit` 无类型错误
- [x] 端到端测试（dev server 启动后）：首用户自动绑管
- [x] 端到端测试（dev server 启动后）：单用户权限授予/回收
- [x] 端到端测试（dev server 启动后）：SYSTEM_ADMIN 唯一性
- [x] 端到端测试（dev server 启动后）：TEACHER 不能进后台
- [x] 端到端测试（dev server 启动后）：Prisma studio 抽查数据一致性
- [x] `npx prisma db push`（**待用户手动执行**）
- [x] `npx tsx prisma/seed-permissions.ts`（**待用户手动执行**）
- [x] `npx tsx scripts/migrate-permission.ts`（**待用户手动执行**）
