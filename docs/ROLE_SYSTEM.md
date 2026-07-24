# 角色体系规范（ROLE_SYSTEM）

> 本文档定义项目唯一的系统角色枚举、判定方式、编写约束。
> **新增任何涉及角色/权限的功能前，必读本文件。**

## 1. 四级角色体系（唯一真相源）

系统采用四级固定角色，按权限从高到低排列：

| 角色值           | 中文标签   | 说明                                                   |
| ---------------- | ---------- | ------------------------------------------------------ |
| `SYSTEM_ADMIN`   | 系统管理员 | 站点最高权限，唯一、不可剥夺/修改/删除                 |
| `ADMIN`          | 管理员     | 除系统设置外的所有功能，可访问后台                     |
| `TEACHER`        | 教师       | 除后台管理外的所有前台内容管理功能                     |
| `STUDENT`        | 学生       | 默认角色，仅参与能力（做题/参赛/加入班级）             |

- **类型定义**：`RoleCode`（[lib/permissions.ts](../lib/permissions.ts)）
- **Schema 字段**：`User.role`（[prisma/schema.prisma](../prisma/schema.prisma)），`@default("STUDENT")`
- **前端常量**：`ROLE_DISPLAY`（[app/admin/users/page.tsx](../app/admin/users/page.tsx)）

> ⚠️ 严禁引入其他角色值。`User` 表只有 `role` 一个字段表达角色，
> 不存在 `isAdmin` / `isSuperAdmin` 等冗余字段。

## 2. 角色能力矩阵

| 能力                | SYSTEM_ADMIN | ADMIN | TEACHER | STUDENT |
| ------------------- | :----------: | :---: | :-----: | :-----: |
| 系统设置（站点配置）|      ✅      |  ❌   |   ❌    |   ❌    |
| 后台管理（/admin/*）|      ✅      |  ✅   |   ❌    |   ❌    |
| 前台内容管理        |      ✅      |  ✅   |   ✅    |   ❌    |
| 查看（公开内容）    |      ✅      |  ✅   |   ✅    |   ✅    |
| 参与（做题/参赛）   |      ✅      |  ✅   |   ✅    |   ✅    |

说明：
- **系统设置**：站点级配置（站点名称、SMTP、系统参数等），仅 `SYSTEM_ADMIN`。
- **后台管理**：访问 `/admin/*` 页面与 `/api/admin/*` 接口（用户管理、题目审核等）。
- **前台内容管理**：创建/编辑题目、竞赛、训练、题解等公开内容。
- **查看 / 参与**：所有角色共享的基础能力。

## 3. 各角色约束

### SYSTEM_ADMIN
- **唯一**：全站仅一个 `SYSTEM_ADMIN`。
- **首用户自动绑定**：注册时若数据库无用户（`prisma.user.count() === 0`），首用户自动赋予 `SYSTEM_ADMIN`，其余用户默认 `STUDENT`（见 [lib/user/service.ts](../lib/user/service.ts) 的 `registerNewUser`）。
- **不可剥夺**：后台无法将 `SYSTEM_ADMIN` 降级为其他角色（`assertCanModifyUser` 拦截）。
- **不可修改**：后台无法修改 `SYSTEM_ADMIN` 的角色 / 密码 / 封禁状态。
- **不可删除**：后台无法删除 `SYSTEM_ADMIN` 账号（`assertCanDeleteUser` 拦截）。
- **批量豁免**：批量操作（`filterUserIdsForBatchAction`）自动跳过 `SYSTEM_ADMIN`。

### ADMIN
- 拥有除系统设置外的所有功能。
- 可访问后台（`/admin/*`、`/api/admin/*`）。
- 可被 `SYSTEM_ADMIN` 在后台用户管理中授予 / 撤销。

### TEACHER
- 拥有除后台管理外的所有前台内容管理功能（创建题目 / 竞赛 / 训练 / 班级 / 题解）。
- **不能**访问 `/admin/*` 后台页面与 `/api/admin/*` 接口。

### STUDENT
- 默认角色，仅具备查看与参与能力。
- 不能创建公开内容，不能访问后台。

## 4. 角色判定函数（必须复用，禁止硬编码）

所有角色判定**必须**调用以下函数，禁止在业务代码中硬编码 `role === 'XXX'`：

| 函数                       | 路径                | 用途                                          |
| -------------------------- | ------------------- | --------------------------------------------- |
| `isSystemAdmin(user)`      | `@/lib/permissions` | 是否为系统管理员（`SYSTEM_ADMIN`）            |
| `isAdmin(user)`            | `@/lib/permissions` | 是否为管理员（`ADMIN`）                       |
| `isTeacher(user)`          | `@/lib/permissions` | 是否为教师（`TEACHER`）                       |
| `isStudent(user)`          | `@/lib/permissions` | 是否为学生（`STUDENT`）                       |
| `canAccessAdmin(user)`     | `@/lib/permissions` | 是否可访问后台（`SYSTEM_ADMIN` + `ADMIN`）    |
| `canManageSystemSettings(user)` | `@/lib/permissions` | 是否可管理系统设置（仅 `SYSTEM_ADMIN`）  |
| `canManageContent(user)`   | `@/lib/permissions` | 是否可管理前台内容（`SYSTEM_ADMIN`+`ADMIN`+`TEACHER`） |
| `canCreateContest(user)`   | `@/lib/permissions` | 是否可创建竞赛（等同 `canManageContent`）     |
| `canCreateClass(user)`     | `@/lib/permissions` | 是否可创建班级（等同 `canManageContent`）     |

```ts
// ✅ 正确
import { canAccessAdmin } from '@/lib/permissions'
if (!canAccessAdmin(user)) return forbidden()

// ❌ 错误 —— 硬编码角色字符串，后续改角色体系时会遗漏
if (user.role === 'SYSTEM_ADMIN' || user.role === 'ADMIN') { ... }
```

> 类型定义见 [lib/permissions.ts](../lib/permissions.ts) 的 `RoleCode`、`RoleUser`。

## 5. API 鉴权包装器

API 路由应使用 [lib/api/withApi.ts](../lib/api/withApi.ts) 提供的包装器，自动完成鉴权 + 错误处理：

| 包装器              | 鉴权要求                                  | 典型场景                       |
| ------------------- | ----------------------------------------- | ------------------------------ |
| `withApi.public`    | 无                                        | 公开接口（登录、题目列表）     |
| `withApi.auth`      | 已登录                                    | 任意登录用户接口               |
| `withApi.admin`     | `canAccessAdmin`（`SYSTEM_ADMIN`+`ADMIN`）| 后台管理接口 `/api/admin/*`    |
| `withApi.systemAdmin` | 仅 `SYSTEM_ADMIN`                       | 系统设置接口                   |
| `withApi.classRole` | 班级角色（owner/assistant/student）       | 班级内部操作（如作业列表/创建、笔记创建等） |

```ts
// 后台接口：SYSTEM_ADMIN / ADMIN 可访问
export const GET = withApi.admin(async (req, { user }) => {
  return ok(await listUsers())
})

// 系统设置接口：仅 SYSTEM_ADMIN
export const PATCH = withApi.systemAdmin(async (req, { user }) => {
  return ok(await updateSystemSettings(await readJson(req)))
})
```

## 6. Middleware 拦截规则

[middleware.ts](../middleware.ts) 在边缘层拦截页面路由：

- **`/admin/*`（非 `/api/`）**：基于 JWT payload 中的 `role`，调用 `canAccessAdmin` 判定，仅 `SYSTEM_ADMIN` 与 `ADMIN` 可放行，其余重定向到 `/403`。
- **`/api/admin/*`**：middleware **不**拦截，由 API 路由的 `withApi.admin` / `withApi.systemAdmin` 在 Node 层鉴权。
- matcher 配置：`['/api/:path*', '/admin/:path*']`。

## 7. 与班级角色的关系（完全独立）

班级角色（`ClassMember.role`）是**班级内部**的概念，与系统角色**完全独立**，互不同步：

| 班级角色（API / DB） | 班级内含义 |
| -------------------- | ---------- |
| `owner`              | 班主任     |
| `assistant`          | 助教       |
| `student`            | 学生       |

- 班级角色定义见 [lib/class/roles.ts](../lib/class/roles.ts)：API 与数据库统一使用 `owner` / `assistant` / `student`。
- 历史数据若仍为 `admin` / `member`，由 `normalizeClassRoleToApi` 分别映射为 `assistant` / `student`。
- **修改班级成员角色不会同步 `User.role`**：班级内是 `owner` 的用户，其系统角色仍可能是 `STUDENT`。
- 反之亦然：系统角色为 `STUDENT` 的用户，可在班级内担任 `owner`。
- 班级内的细粒度能力（`canViewProblems` / `canSubmit` / `canCreateNotes` 等）由 `ClassMember.permissions`（JSON）控制，与系统角色无关。

## 8. 后台用户管理

- 修改用户角色 API：`PATCH /api/admin/users/[id]`，`role` 字段仅接受 `SYSTEM_ADMIN` / `ADMIN` / `TEACHER` / `STUDENT`。
- 批量修改：`POST /api/admin/users/batch-update`，同上。
- 批量注册：`POST /api/admin/users/batch-register`，默认角色 `STUDENT`。
- 校验函数：`assertValidRole()`（[lib/user/service.ts](../lib/user/service.ts)），白名单 `VALID_ADMIN_ROLES = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']`。
- `SYSTEM_ADMIN` 不可被降级 / 修改 / 删除（`assertCanModifyUser` / `assertCanDeleteUser` 拦截）。
- 批量操作自动跳过 `SYSTEM_ADMIN`（`filterUserIdsForBatchAction`）。
- 修改用户后必须调用 `clearUserCache(userId)` 清除缓存，避免登录态读到旧角色。

## 9. JWT Payload

JWT token 只包含 `userId` / `email` / `username` / `role` 四个字段，
不包含 `isAdmin` / `isSuperAdmin`。中间件通过 `payload.role` 经 `canAccessAdmin` 判定后台访问权限。

## 10. 已废弃：权限点系统

项目早期采用基于权限点（Permission）的细粒度授权，已**完全移除**，不得再使用：

- ❌ `Permission` / `RolePermission` / `UserPermission` 三张表（已从 Prisma schema 删除）。
- ❌ `hasPermission` / `withPermission` / `usePermission` 等 hook / HOC / 工具函数。
- ❌ `PermissionCode` / `Permission` 枚举及任何权限码常量。

历史遗留数据（数据库中残留的三个集合）可通过一次性迁移脚本清理：
[scripts/migrate-remove-permissions.ts](../scripts/migrate-remove-permissions.ts)。

> 角色判定统一改用 `@/lib/permissions` 的角色函数 + `withApi.admin` / `withApi.systemAdmin` 包装器。

## 11. Checklist（新增功能时自查）

- [ ] 角色判定是否调用了 `@/lib/permissions` 的函数，而非硬编码 `role ===` ？
- [ ] 后台 API 是否使用 `withApi.admin` / `withApi.systemAdmin`？
- [ ] 新增的角色相关 API 是否在 `assertValidRole()` / `VALID_ADMIN_ROLES` 中注册？
- [ ] 前端角色下拉框选项是否与 `ROLE_DISPLAY`（4 个角色）一致？
- [ ] 是否引入了 `SUPER_ADMIN` / `USER` 等旧值？（应为否）
- [ ] 是否在 Prisma select 中残留了 `isAdmin` / `isSuperAdmin`？（应为否，这两个字段已从 schema 删除）
- [ ] 是否清除了用户缓存（`clearUserCache`），避免登录态读到旧角色？
- [ ] 是否误用了 `Permission` / `hasPermission` / `PermissionCode` 等已废弃的权限点 API？（应为否）
