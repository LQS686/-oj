# 移除权限点系统并统一角色体系 Spec

## Why

当前项目实施了 RBAC + 细粒度权限点系统（`Permission`/`RolePermission`/`UserPermission` 三张表 + 38 个权限码 + `hasPermission`/`withPermission`/`usePermission` 全链路），但该系统过度复杂、散落点广（约 70 个文件引用），维护成本远高于收益。实际业务场景只需 4 个固定角色即可覆盖全部权限边界。同时班级角色变更会反向同步修改系统 `User.role`（`patchClassMember` 中 `classApiRoleToSystemRole`），违反"班级角色独立"的业务诉求。

本次重构将权限模型从"细粒度权限点"回归为"固定角色判定"，新增 `ADMIN` 角色，明确四级角色权限边界，并彻底解耦班级角色与系统角色。

## What Changes

### 一、角色体系统一为四级（新增 ADMIN）

| 角色 code | 中文 | 权限边界 |
|---|---|---|
| `SYSTEM_ADMIN` | 系统管理员 | 最高权限，**唯一**，不可剥夺/不可修改，首注册用户自动绑定。包含系统设置在内的全部功能。 |
| `ADMIN` | 管理员 | 除系统设置外的所有功能。可正常使用后台管理（`/admin/*`）除系统设置外的全部页面与 API。 |
| `TEACHER` | 教练 | 除后台管理以外的所有功能。可在前台创建/编辑题目、竞赛、题单、班级等，但不能访问 `/admin/*` 后台。 |
| `STUDENT` | 学生 | 仅具备参与能力（做题、参赛、加入班级、提交作业），不具备任何管理/创建/编辑能力。 |

**角色能力矩阵：**

| 能力 | SYSTEM_ADMIN | ADMIN | TEACHER | STUDENT |
|---|---|---|---|---|
| 系统设置（`/admin/settings`） | ✓ | ✗ | ✗ | ✗ |
| 后台管理（`/admin/*` 除 settings） | ✓ | ✓ | ✗ | ✗ |
| 前台内容管理（创建/编辑题目、竞赛、题单、班级） | ✓ | ✓ | ✓ | ✗ |
| 查看内容（题目、竞赛等） | ✓ | ✓ | ✓ | ✓ |
| 参与（提交、参赛、加入班级、做作业） | ✓ | ✓ | ✓ | ✓ |

### 二、彻底移除权限点系统

**BREAKING** 移除以下数据模型（Prisma schema）：
- `Permission`（权限点定义表）
- `RolePermission`（角色 ↔ 权限点关联表）
- `UserPermission`（用户级权限覆盖表）
- `User.userPermissions` 关联字段

**BREAKING** 移除以下代码文件/目录：
- `lib/permissions/` 整个目录（`permissions.ts` / `guard.ts` / `types.ts` / `role.ts` / `index.ts`）
- `lib/api/withPermission.ts`（细粒度权限包装器）
- `hooks/usePermission.ts`（客户端权限 hook）
- `app/api/admin/permissions/`（权限点列表 API）
- `app/api/admin/roles/`（角色权限配置 API）
- `app/api/admin/users/[id]/permissions/`（用户权限微调 API）
- `app/admin/permissions/`（权限点列表页）
- `app/admin/roles/`（角色权限配置页）
- `app/admin/users/[id]/permissions/`（用户权限微调页）
- `prisma/seed-permissions.ts`（权限点 seed 脚本）
- `scripts/cleanup-deprecated-permissions.ts`（废弃权限清理脚本）

**BREAKING** 移除以下接口字段：
- `/api/auth/me` 响应中的 `permissions: string[]` 字段
- `lib/api/auth.ts` 中 `UserData.permissions` 字段
- `contexts/UserContext.tsx` 中 permissions 相关逻辑

### 三、权限校验改为角色判定

- `lib/permissions.ts` 简化为纯角色判定入口，移除所有 `hasPermission`/`requirePermission`/`PermissionCode` re-export
- 保留并新增角色判定 helper：
  - `isSystemAdmin(user)` / `isAdmin(user)` / `isTeacher(user)` / `isStudent(user)`：基础角色判定
  - `canAccessAdmin(user)`：`isSystemAdmin || isAdmin`（后台访问）
  - `canManageSystemSettings(user)`：仅 `isSystemAdmin`（系统设置）
  - `canManageContent(user)`：`isSystemAdmin || isAdmin || isTeacher`（前台内容管理）
- `withApi.admin(handler)` 改为检查 `canAccessAdmin(user)`
- 新增 `withApi.systemAdmin(handler)` 用于系统设置路由（仅 SYSTEM_ADMIN）
- 所有 `withPermission('xxx')` 调用替换为对应角色判定：
  - `/api/admin/settings` → `withApi.systemAdmin`
  - 其他 `/api/admin/**` → `withApi.admin`
  - 前台管理 API（`/api/problems` POST、`/api/contests` POST 等）→ `canManageContent(user)` 校验
- `middleware.ts` 改为基于 JWT payload 中的 `role` 拦截 `/admin/*`（仅 `SYSTEM_ADMIN` + `ADMIN` 可访问）
- `AdminLayout.tsx` 菜单显隐改为基于 `user.role` 判定，移除 `permission` 字段
- 客户端组件移除 `usePermission` 调用，改用 `user.role` + `lib/permissions.ts` 的 helper 函数判定

### 四、班级角色与系统角色彻底解耦

- 移除 `lib/class/service.ts` 中 `patchClassMember` 的系统角色同步逻辑（line 274-292）及 `classApiRoleToSystemRole` 函数
- 班级内 `ClassMember.role`（`owner`/`assistant`/`student`）仅影响班级内权限，**不修改** `User.role`
- 保留 `ClassMember.permissions` JSON 字段（班级内细粒度能力开关，与系统权限点无关）

### 五、数据迁移

- 一次性迁移脚本：清空 `Permission` / `RolePermission` / `UserPermission` 集合
- 现有用户 `User.role` 保持不变（`SYSTEM_ADMIN`/`TEACHER`/`STUDENT`），`ADMIN` 为新增角色由 SYSTEM_ADMIN 在后台分配
- 首用户 `SYSTEM_ADMIN` 自动绑定逻辑保持不变

## Impact

- **Affected specs**：`unify-permission-system`（前序 spec，本 spec 反向移除其引入的权限点系统）、`fix-permission-usage`（权限点使用优化，整体废弃）
- **Affected code**：
  - `prisma/schema.prisma` — 移除 Permission/RolePermission/UserPermission 模型及 User.userPermissions 关联
  - `lib/permissions/` — 整个目录删除
  - `lib/permissions.ts` — 简化为纯角色判定
  - `lib/api/withApi.ts` / `lib/api/handler.ts` — 移除权限点包装器，改为角色判定
  - `lib/api/withPermission.ts` — 删除
  - `hooks/usePermission.ts` — 删除
  - `middleware.ts` — 改为 role 拦截
  - `components/AdminLayout.tsx` — 菜单改为 role 判定
  - `app/api/auth/me/route.ts` — 移除 permissions 字段
  - `app/api/admin/**` — 30+ 路由替换 withPermission
  - `app/api/admin/permissions/` / `app/api/admin/roles/` / `app/api/admin/users/[id]/permissions/` — 删除
  - `app/admin/permissions/` / `app/admin/roles/` / `app/admin/users/[id]/permissions/` — 删除
  - `lib/class/service.ts` — 移除系统角色同步
  - `lib/user/service.ts` — VALID_ADMIN_ROLES 增加 ADMIN
  - `lib/solution/permissions.ts` / `lib/contest-auth.ts` — 改为角色判定
  - `prisma/seed.ts` — 移除权限点 seed
  - `docs/ROLE_SYSTEM.md` — 更新为四级角色文档
  - `contexts/UserContext.tsx` / `lib/api/auth.ts` — 移除 permissions 字段

## ADDED Requirements

### Requirement: 四级固定角色体系

系统 SHALL 提供四个互斥的系统级角色，权限由角色决定，不再依赖权限点：
- `SYSTEM_ADMIN`（系统管理员）：唯一，首注册用户自动绑定，拥有全部功能含系统设置，不可被剥夺/修改/删除
- `ADMIN`（管理员）：拥有除系统设置外的全部功能，可访问后台管理
- `TEACHER`（教练）：拥有除后台管理外的全部前台管理功能
- `STUDENT`（学生）：仅具备参与能力，无任何管理/创建/编辑权限

#### Scenario: 首用户注册自动绑管
- **GIVEN** 系统 User 表为空
- **WHEN** 任意新用户完成注册
- **THEN** 该用户 `role=SYSTEM_ADMIN`
- **AND** 后续注册用户 `role=STUDENT`

#### Scenario: SYSTEM_ADMIN 唯一且不可被剥夺
- **GIVEN** 已存在 1 个 SYSTEM_ADMIN
- **WHEN** 尝试将另一用户改为 SYSTEM_ADMIN
- **THEN** 系统拒绝（409），原 SYSTEM_ADMIN 保持不变
- **AND** SYSTEM_ADMIN 不可被删除、不可被降级

#### Scenario: ADMIN 不能访问系统设置
- **GIVEN** 张三是 ADMIN
- **WHEN** 张三访问 `/admin/settings` 或调用 `/api/admin/settings`
- **THEN** 返回 403 / 重定向到 403

#### Scenario: TEACHER 不能访问后台
- **GIVEN** 李四是 TEACHER
- **WHEN** 李四访问 `/admin/users`
- **THEN** middleware 拦截并 302 跳转到 `/403`

#### Scenario: TEACHER 可在前台创建内容
- **GIVEN** 李四是 TEACHER
- **WHEN** 李四在前台访问 `/contests/create` 创建竞赛
- **THEN** 创建成功（拥有前台管理权限 `canManageContent`）

#### Scenario: STUDENT 不能创建内容
- **GIVEN** 王五是 STUDENT
- **WHEN** 王五尝试创建竞赛/题目/班级
- **THEN** 返回 403

### Requirement: 班级角色与系统角色彻底解耦

系统 SHALL 确保班级内角色（`ClassMember.role`）与系统角色（`User.role`）完全独立。在班级中授予教师角色只对该班级生效，不修改用户的系统角色属性。

#### Scenario: 班级内授予教师角色不改变系统角色
- **GIVEN** 王五是系统级 STUDENT，加入某班级
- **WHEN** 班级管理员将王五的班级角色设为 `assistant`（教师）
- **THEN** 王五在该班级内拥有管理权限
- **AND** 王五的系统 `User.role` 仍为 STUDENT（不变）
- **AND** 王五仍不能访问 `/admin/*` 后台

#### Scenario: 班级角色降级不影响系统角色
- **GIVEN** 李四是系统级 TEACHER，在某班级担任 `assistant`
- **WHEN** 班级管理员将李四的班级角色降为 `student`
- **THEN** 李四在该班级内失去管理权限
- **AND** 李四的系统 `User.role` 仍为 TEACHER（不变）

### Requirement: 角色判定统一接口

系统 SHALL 通过 `lib/permissions.ts` 提供统一的角色判定函数，所有权限校验收敛到这些函数。**禁止**在业务代码中使用 `hasPermission`/`withPermission` 或硬编码权限点字符串。

#### Scenario: 后台 API 角色校验
- **GIVEN** `/api/admin/problems` 路由使用 `withApi.admin` 包装
- **WHEN** TEACHER 用户调用该 API
- **THEN** 返回 403（TEACHER 无后台访问权限）

#### Scenario: 系统设置 API 校验
- **GIVEN** `/api/admin/settings` 路由使用 `withApi.systemAdmin` 包装
- **WHEN** ADMIN 用户调用该 API
- **THEN** 返回 403（仅 SYSTEM_ADMIN 可访问）

#### Scenario: 前台管理 API 校验
- **GIVEN** `/api/contests` POST 路由使用 `canManageContent` 校验
- **WHEN** STUDENT 用户调用该 API
- **THEN** 返回 403

## REMOVED Requirements

### Requirement: 细粒度权限点系统

**Reason**：权限点系统（Permission/RolePermission/UserPermission）过度复杂，散落 70+ 文件，实际业务只需 4 个固定角色即可覆盖，维护成本高于收益。

**Migration**：
- 一次性迁移脚本清空 `Permission`/`RolePermission`/`UserPermission` 集合
- Prisma schema 移除三个模型及 `User.userPermissions` 关联
- 所有 `hasPermission(code)`/`withPermission(code)` 调用替换为角色判定函数
- 权限管理页面与 API 删除
- `/api/auth/me` 不再返回 `permissions` 字段

### Requirement: 用户级权限覆盖

**Reason**：`UserPermission` 表支持单用户细粒度授权，在固定角色体系下不再需要。

**Migration**：删除 `UserPermission` 表及相关 API/页面，现有覆盖数据丢弃（角色体系已能覆盖业务场景）。

### Requirement: 班级角色同步系统角色

**Reason**：`patchClassMember` 中将班级角色变更同步到 `User.role` 违反"班级角色独立"原则，导致系统角色被意外修改。

**Migration**：移除 `patchClassMember` 中的同步逻辑（line 274-292）和 `classApiRoleToSystemRole` 函数，班级角色仅影响班级内权限。
