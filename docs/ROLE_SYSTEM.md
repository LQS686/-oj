# 角色体系规范（ROLE_SYSTEM）

> 本文档定义项目唯一的系统角色枚举、判定方式、编写约束。
> **新增任何涉及角色/权限的功能前，必读本文件。**

## 1. 合法角色值（唯一真相源）

| 角色值           | 中文标签   | 说明                                     |
| ---------------- | ---------- | ---------------------------------------- |
| `SYSTEM_ADMIN`   | 系统管理员 | 站点最高权限，不可被降级                 |
| `TEACHER`        | 教师       | 可创建班级/竞赛/题单，管理题解           |
| `STUDENT`        | 学生       | 默认角色，普通用户                       |

- **类型定义**：`RoleCode`（[lib/permissions/types.ts](../lib/permissions/types.ts)）
- **Schema 字段**：`User.role`（[prisma/schema.prisma](../prisma/schema.prisma)），`@default("STUDENT")`
- **前端常量**：`ROLE_DISPLAY`（[app/admin/users/page.tsx](../app/admin/users/page.tsx)）

> ⚠️ 严禁引入其他角色值。`User` 表只有 `role` 一个字段表达角色，
> 不存在 `isAdmin` / `isSuperAdmin` 等冗余字段。

## 2. 角色判定函数（必须复用，禁止硬编码）

所有角色判定**必须**调用以下函数，禁止在业务代码中硬编码 `role === 'XXX'`：

| 函数             | 路径                          | 用途                         |
| ---------------- | ----------------------------- | ---------------------------- |
| `isAdmin(user)`  | `@/lib/permissions`           | 是否为系统管理员             |
| `isTeacher(user)`| `@/lib/permissions`           | 是否为教师                   |
| `isSystemAdmin(user)` | `@/lib/permissions`       | 同 `isAdmin`（语义别名）     |
| `isStudent(user)`| `@/lib/permissions`           | 是否为学生                   |
| `canAccessAdmin(user)` | `@/lib/permissions`      | 是否可访问后台               |
| `canCreateContest(user)` | `@/lib/permissions`     | 是否可创建竞赛               |
| `canCreateClass(user)` | `@/lib/permissions`       | 是否可创建班级               |

```ts
// ✅ 正确
import { isAdmin } from '@/lib/permissions'
if (!isAdmin(user)) return forbidden()

// ❌ 错误 —— 硬编码角色字符串，后续改角色体系时会遗漏
if (user.role === 'SYSTEM_ADMIN') { ... }
```

## 3. 与班级角色的关系

班级角色（`ClassMember.role`）是**班级内部**的概念，与系统角色独立：

| 班级角色 API  | 班级内含义 | 同步到的系统角色 |
| ------------- | ---------- | ---------------- |
| `owner`       | 班主任     | `TEACHER`        |
| `assistant`   | 助教       | `TEACHER`        |
| `student`     | 学生       | `STUDENT`        |

- 在班级中修改成员角色时，[lib/class/service.ts](../lib/class/service.ts) 的 `patchClassMember` 会自动同步 `User.role`。
- **保护规则**：`SYSTEM_ADMIN` 用户不会被班级操作降级。

## 4. 后台用户管理

- 修改用户角色的 API：`PATCH /api/admin/users/[id]`，`role` 字段仅接受 `SYSTEM_ADMIN` / `TEACHER` / `STUDENT`。
- 批量修改：`POST /api/admin/users/batch-update`，同上。
- 批量注册：`POST /api/admin/users/batch-register`，默认角色 `STUDENT`。
- 校验函数：`assertValidRole()`（[lib/user/service.ts](../lib/user/service.ts)）。
- `SYSTEM_ADMIN` 不可被降级（业务层校验）。

## 5. JWT Payload

JWT token 只包含 `userId` / `email` / `username` / `role` 四个字段，
不包含 `isAdmin` / `isSuperAdmin`。中间件通过 `payload.role === 'SYSTEM_ADMIN'` 判断后台访问权限。

## 6. Checklist（新增功能时自查）

- [ ] 角色判定是否调用了 `@/lib/permissions` 的函数，而非硬编码 `role ===` ？
- [ ] 新增的角色相关 API 是否在 `assertValidRole()` / `VALID_ADMIN_ROLES` 中注册？
- [ ] 前端角色下拉框选项是否与 `ROLE_DISPLAY` 一致？
- [ ] 是否引入了 `ADMIN` / `USER` / `SUPER_ADMIN` 等旧值？（应为否）
- [ ] 是否在 Prisma select 中残留了 `isAdmin` / `isSuperAdmin`？（应为否，这两个字段已从 schema 删除）
- [ ] 是否清除了用户缓存（`clearUserCache`），避免登录态读到旧角色？
