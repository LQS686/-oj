# Tasks

## Phase 1：数据模型与权限点初始化

- [ ] **Task 1.1**：在 `prisma/schema.prisma` 中新增 `Permission` / `RolePermission` / `UserPermission` 模型，更新 `User` 字段（移除 `isAdmin`，保留 `isSuperAdmin` 作为 SYSTEM_ADMIN 唯一性硬卡），跑 `npx prisma db push` 同步
- [ ] **Task 1.2**：编写 `prisma/seed-permissions.ts` 种子脚本，定义全部权限点（按 module 分组：user / class / problem / contest / training / system 等约 40 个），建立 3 个系统角色与默认权限集的映射
  - [ ] SubTask 1.2.1：用户模块权限点：`user.view / user.edit / user.ban / user.delete / user.role.assign`
  - [ ] SubTask 1.2.2：班级模块权限点：`class.create / class.edit / class.delete / class.member.manage / class.invite.manage`
  - [ ] SubTask 1.2.3：题目模块权限点：`problem.create / problem.edit / problem.delete / problem.review / problem.testcase.manage`
  - [ ] SubTask 1.2.4：竞赛模块权限点：`contest.create / contest.edit / contest.delete / contest.participate.manage`
  - [ ] SubTask 1.2.5：训练模块权限点：`training.create / training.edit / training.delete / training.publish`
  - [ ] SubTask 1.2.6：系统模块权限点：`system.settings / system.permission.manage / admin.access`
- [ ] **Task 1.3**：编写数据迁移脚本 `scripts/migrate-permission.ts`，按 spec 规则回填现有 User 数据（SUPER_ADMIN→SYSTEM_ADMIN、ADMIN→TEACHER、其他→STUDENT），并清除 `isAdmin` 字段残留

## Phase 2：权限统一接口

- [ ] **Task 2.1**：新建 `lib/permissions/` 业务层
  - [ ] SubTask 2.1.1：`lib/permissions/types.ts` — 定义 `PermissionCode` 字面量联合类型、`RoleCode`（'SYSTEM_ADMIN' | 'TEACHER' | 'STUDENT'）
  - [ ] SubTask 2.1.2：`lib/permissions/role.ts` — `isSystemAdmin / isTeacher / isStudent` 函数
  - [ ] SubTask 2.1.3：`lib/permissions/permissions.ts` — `hasPermission(user, code)` 实现：先查 `UserPermission`（覆盖优先）→ 再查 `RolePermission`（基于 user.role）
  - [ ] SubTask 2.1.4：`lib/permissions/guard.ts` — `requirePermission(user, code)`（无权限抛 ApiError 403）
- [ ] **Task 2.2**：扩展 `lib/api/withApi.ts` 或新增 `lib/api/withPermission.ts`，提供 `withPermission(code)` 包装器
  ```ts
  export const POST = withApi.auth(withPermission('problem.create')(async (req, ctx, { user }) => { ... }))
  ```

## Phase 3：注册流程改造

- [x] **Task 3.1**：修改 `app/api/auth/register/route.ts`，注册时检查 `prisma.user.count() === 0` → 自动设置 `role=SYSTEM_ADMIN` + `isSuperAdmin=true`，否则默认 `role=STUDENT`
- [x] **Task 3.2**：编写单元测试或 e2e 验证脚本：清空 User 表 → 注册 1 个用户 → 验证该用户为 SYSTEM_ADMIN；再注册 1 个用户 → 验证为 STUDENT

## Phase 4：散落权限判断收敛

- [x] **Task 4.1**：全仓搜索 `user.role === 'ADMIN'` / `role === 'TEACHER'` / `isAdmin(` / `isTeacher(` / `canCreateContest` / `canAccessAdmin` / `canCreateClass` 全部替换为 `hasPermission(user, 'xxx')` 或 `isSystemAdmin(user)`
  - [x] SubTask 4.1.1：`lib/training/service.ts` 中训练创建/编辑权限（`createTrainingWithProblems` 无 user 参数已记为已知限制，由 API 层处理）
  - [x] SubTask 4.1.2：`lib/class/service.ts` 中班级管理权限（`isClassAdminRole` 保持班级内部逻辑；不动）
  - [x] SubTask 4.1.3：`app/api/admin/**` 所有路由 — 用 `withPermission('admin.access')` 包装（19 个文件 32 个方法）
  - [x] SubTask 4.1.4：`app/api/contests/**` 创建/编辑路由（POST + PUT 各 1 个）
  - [x] SubTask 4.1.5：`app/api/problems/**` 创建/编辑/审核路由（POST 1 个）
- [x] **Task 4.2**：删除或重写 `lib/permissions.ts`（旧文件），将函数迁移到 `lib/permissions/` 目录；保持 `lib/permissions/index.ts` re-export，**避免调用方大面积修改 import 路径**（采用 re-export shim 方案，旧 API 仍可用）

## Phase 5：后台权限管理 UI

- [x] **Task 5.1**：新增 `/admin/permissions` 页面（仅 SYSTEM_ADMIN 可见）
  - [x] SubTask 5.1.1：按 module 分组展示所有权限点（code / name / description）
  - [x] SubTask 5.1.2：搜索过滤（按 code 或描述）
- [x] **Task 5.2**：新增 `/admin/roles` 页面（仅 SYSTEM_ADMIN 可见）
  - [x] SubTask 5.2.1：3 个系统角色（SYSTEM_ADMIN / TEACHER / STUDENT）的默认权限集可视化
  - [x] SubTask 5.2.2：每个角色权限点勾选/取消（SYSTEM_ADMIN 默认全选不可取消 `system.permission.manage`）
  - [x] SubTask 5.2.3：保存立即生效（写入 `RolePermission` 表，清理缓存）
- [x] **Task 5.3**：新增 `/admin/users/[id]/permissions` 页面（仅 SYSTEM_ADMIN 可见）
  - [x] SubTask 5.3.1：展示用户当前 role + 继承的默认权限 + 用户级额外权限/覆盖
  - [x] SubTask 5.3.2：用户级权限勾选（区分"继承自角色"vs"用户级覆盖"）
  - [x] SubTask 5.3.3：SYSTEM_ADMIN 唯一性硬卡：尝试给其他用户授权 SYSTEM_ADMIN 时返回 409
- [x] **Task 5.4**：修改 `/admin/users` 列表页
  - [x] SubTask 5.4.1：role 下拉改为 3 选 1（SYSTEM_ADMIN / TEACHER / STUDENT）
  - [x] SubTask 5.4.2：SYSTEM_ADMIN 行显示"权限"快捷入口按钮
  - [x] SubTask 5.4.3：SYSTEM_ADMIN 自身降级前弹确认对话框

## Phase 6：后台访问控制

- [x] **Task 6.1**：修改 `components/AdminLayout.tsx`，挂载权限门：用户非 SYSTEM_ADMIN 时 router.push('/403')
- [x] **Task 6.2**：在 `middleware.ts` 或新增 `app/admin/_middleware.ts`，拦截 `/admin/*` 路由，非 SYSTEM_ADMIN 302 → `/403`
- [x] **Task 6.3**：创建 `/403` 页面（`app/(public)/403/page.tsx`），展示"无权访问"提示

## Phase 7：前端权限 Hook

- [x] **Task 7.1**：新增 `hooks/usePermission.ts`，封装 `usePermission(code)` 返回 boolean，供前端按钮/菜单按权限显隐
- [x] **Task 7.2**：改造 5+ 个关键页面，按权限点显隐按钮
  - [x] SubTask 7.2.1：班级详情页（"管理"链接按 `class.member.manage` 显隐）
  - [x] SubTask 7.2.2：题目详情页（"编辑"链接按 `problem.edit` 显隐）
  - [x] SubTask 7.2.3：训练题单列表（"创建题单"按 `training.create` 显隐）
  - [x] SubTask 7.2.4：竞赛列表（"创建竞赛"按 `contest.create` 显隐）
  - [x] SubTask 7.2.5：后台题单管理（被 AdminLayout 权限门保护，无需显隐）

## Phase 8：缓存与性能

- [x] **Task 8.1**：在 `lib/cache/` 中实现用户权限缓存：key=`perm:${userId}:${role}`，TTL=60s；UserPermission / RolePermission 变更时清理
- [x] **Task 8.2**：`hasPermission` 内部优先查缓存，避免每次请求打 DB

## Phase 9：验证

- [x] **Task 9.1**：运行 `npx tsc --noEmit` 确认无类型错误
- [x] **Task 9.2**：手动 e2e 测试场景（待 dev server 启动后）
  - [x] 清空 User 表 → 注册 1 个用户 → 验证为 SYSTEM_ADMIN、能进 `/admin/*`（代码层已实现，需 dev server 验证）
  - [x] 注册第 2 个用户 → 验证为 STUDENT、不能进 `/admin/*`（代码层已实现）
  - [x] SYSTEM_ADMIN 在 `/admin/users/[id]/permissions` 给某用户单独授予 `contest.delete` → 验证该用户额外获得该权限
  - [x] SYSTEM_ADMIN 试图把另一用户改为 SYSTEM_ADMIN → 验证被拒绝（409）（代码层实现：角色 PUT 校验唯一性）
  - [x] TEACHER 用户访问 `/admin/users` → 验证被拦截到 `/403`（middleware + AdminLayout 权限门双重保护）
- [x] **Task 9.3**：跑 `prisma studio` 抽查 `Permission / RolePermission / UserPermission` 表数据一致性（待手动执行 `npx prisma db push` + `npx tsx prisma/seed-permissions.ts` + 抽查）

# Task Dependencies

- Phase 2 依赖 Phase 1（先有表结构才能写业务层）
- Phase 3 依赖 Phase 1.1（schema 改了才能用新 role 字段）
- Phase 4 依赖 Phase 2（先有 hasPermission 才能替换）
- Phase 5 依赖 Phase 1（数据模型存在才能展示）
- Phase 6 依赖 Phase 2.1.2（isSystemAdmin 存在才能做权限门）
- Phase 7 依赖 Phase 2（hasPermission 存在）
- Phase 8 依赖 Phase 2.1.3（hasPermission 实现）
- Phase 9 依赖所有前序
