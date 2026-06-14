# 统一权限系统 Spec

## Why

当前项目存在严重的权限混乱：

1. **角色字段语义冗余/矛盾**：`User` 模型同时有 `isAdmin: Boolean`、`role: String`、`isSuperAdmin: Boolean` 三个字段，相互之间无明确语义关系；`lib/permissions.ts` 的 `isAdmin()` 把 `role='ADMIN' || 'SUPER_ADMIN' || isAdmin=true` 三者**都**算管理员，而 `canAccessAdmin()` 又把 `TEACHER` 也算管理员，**与业务需求"教师不能进入管理后台"直接矛盾**。
2. **首用户自动绑定未实现**：Prisma schema 里有 `isSuperAdmin: Boolean` 字段，但**注册流程从未检查"是否是首位用户"**，更不会自动设置超管身份。
3. **权限粒度过粗**：`User.role` 只能取 `ADMIN/TEACHER/USER` 三个枚举值，所有"管理员"都拥有全部后台权限，无法为单个用户/教师细粒度地开关能力（如"只允许某教师发布训练题单，不允许删题"）。
4. **后台无权限管理界面**：`/app/admin/users` 只能整段改 `role` 字符串，**没有"权限点 → 角色 → 用户"的细粒度配置入口**。
5. **权限校验分散**：班级、训练、题单、用户管理各模块各自写 `if (user.role === 'ADMIN')`，缺少统一的权限 helper。

本次重构将权限从"字符串三选一"升级为 **RBAC + 细粒度权限点**，并补齐"首用户自动绑管"、"后台可视化权限配置"两个长期缺失的能力。

## What Changes

### 一、角色模型重新设计（Prisma schema）

**保留**三类顶层角色（系统级身份），用统一的 `role` 字段：

| 角色 code | 中文 | 描述 |
|---|---|---|
| `SYSTEM_ADMIN` | 系统管理员 | 全局最高权限，**唯一**（数量恒为 1）。首注册用户自动绑定。 |
| `TEACHER` | 教师 | 拥有创建/管理班级、题目、训练、作业等业务管理权限；**不能进入管理后台**。 |
| `STUDENT` | 学生 | 普通用户，无管理权限。 |

**新增**细粒度权限模型：

- `Permission`：原子权限点（code + module + description），如 `problem.create`、`class.member.manage`、`system.permission.manage`。
- `RolePermission`：角色 ↔ 权限点（多对多）。系统内置 3 个角色的默认权限集；可由系统管理员调整。
- `UserPermission`：用户 ↔ 权限点（多对多），用于**单用户细粒度覆盖/扩展**（如"给某教师额外开 `contest.delete` 权限"）。

**废弃/移除**：
- 移除 `User.isAdmin: Boolean`（语义被 `role` 覆盖，避免双源真相）
- 保留 `User.isSuperAdmin: Boolean`（用于代码层硬卡 SYSTEM_ADMIN 唯一性 + 防误删），但语义简化为"等同于 `role === 'SYSTEM_ADMIN'`"
- 移除 `lib/permissions.ts` 中基于 `isAdmin` 的双轨判断

### 二、注册流程改造

- 注册时检查 `User.count() === 0` → **新用户**自动获得 `role=SYSTEM_ADMIN` + `isSuperAdmin=true`
- 后续注册默认 `role=STUDENT`
- 已注册用户由 SYSTEM_ADMIN 在后台改 role

### 三、权限校验统一

- 新建 `lib/permissions/` 业务层：
  - `permissions.ts`：`PermissionCode` 类型常量、`hasPermission(user, code)`、`requirePermission(user, code)` 抛 403
  - `role.ts`：`getSystemRole(user)`、`isSystemAdmin(user)`、`isTeacher(user)`、`isStudent(user)`
  - `guard.ts`：服务端 `withApi` 包装器 `withPermission(code)`、前端 `usePermission(code)` hook
- **所有** `if (user.role === 'ADMIN')` 散落代码统一替换为 `hasPermission(user, 'module.action')`
- AdminLayout 加权限门：`/admin/*` 路由仅 `SYSTEM_ADMIN` 可进入；教师即使能 `class.create` 也进不了后台
- `middleware.ts`（或新增 `app/admin/middleware.ts`）拦截 `/admin/*` 越权访问 → 302 → `/403`

### 四、后台权限管理 UI（新增）

新增 3 个管理页面（**仅 SYSTEM_ADMIN 可见**）：

- `/admin/permissions`：权限点列表（按 module 分组，展示 code/name/description）
- `/admin/roles`：角色管理（编辑 SYSTEM_ADMIN/TEACHER/STUDENT 的默认权限集；可创建自定义角色）
- `/admin/users/[id]/permissions`：单个用户权限微调（基于默认 role 权限集，单点勾选/取消权限点；显示"继承自角色"vs"用户级覆盖"区分）

`/admin/users` 列表页：每行新增"权限"快捷入口；角色下拉从字符串改为 3 选 1（SYSTEM_ADMIN 受限，**唯一性由后端校验**）。

### 五、ClassMember 内部角色同步

- 班级内部 `ClassMember.role`（`teacher/assistant/student`）的命名统一为 `teacher`（注释修正）；与系统级 `TEACHER` 解耦（班级内部 `teacher` 可由 STUDENT 担任；进入后台判定只看系统级 `role`）。
- 之前 `fix-current-page-errors` 的 4 处 `'admin' → 'assistant'` 修复保持不变。

## Impact

- **Affected specs**：`rename-team-to-class`（ClassMember 角色命名统一）、`fix-current-page-errors`（权限 bug 修复）、`add-problem-list-feature`（training 模块权限校验）
- **Affected code**：
  - `prisma/schema.prisma` — User/新增 Permission/RolePermission/UserPermission 模型
  - `lib/permissions.ts` — 重写为目录 `lib/permissions/`
  - `lib/auth.ts` — 注册时绑定 SYSTEM_ADMIN
  - `app/api/auth/register/route.ts` — 首用户自动绑管
  - `app/admin/**` — 20+ 个页面权限校验收敛
  - `components/AdminLayout.tsx` — 加权限门
  - `app/admin/permissions/page.tsx` — 新增
  - `app/admin/roles/page.tsx` — 新增
  - `app/admin/users/[id]/permissions/page.tsx` — 新增
  - `app/api/admin/permissions/**` — 新增 3 个 API
  - 所有 API route handler — 散落的 `role === 'ADMIN'` 判断替换

## ADDED Requirements

### Requirement: 统一系统级角色

系统 SHALL 提供三个互斥的系统级角色：`SYSTEM_ADMIN`（系统管理员，唯一）、`TEACHER`（教师）、`STUDENT`（学生）。`User.role` 字段是单一真相源。

#### Scenario: 首用户注册自动绑管
- **GIVEN** 系统初始化时 User 表为空
- **WHEN** 任意新用户完成注册
- **THEN** 该用户 `role=SYSTEM_ADMIN`、`isSuperAdmin=true`
- **AND** 后续注册的用户 `role=STUDENT`

#### Scenario: 角色数量约束
- **GIVEN** 已存在 1 个 SYSTEM_ADMIN
- **WHEN** SYSTEM_ADMIN 在后台把另一用户改为 SYSTEM_ADMIN
- **THEN** 系统拒绝并返回 409（冲突），原 SYSTEM_ADMIN 保持不变
- **AND** 必须先把当前 SYSTEM_ADMIN 降级为 TEACHER/STUDENT，才能提升下一个

### Requirement: 细粒度权限点

系统 SHALL 提供按"模块.动作"命名的原子权限点（如 `problem.create`、`class.member.manage`），定义在 `Permission` 表中。`SYSTEM_ADMIN` 默认拥有全部权限点；`TEACHER` 默认拥有业务管理类权限点（不含 `system.*` 与 `admin.*`）；`STUDENT` 默认无任何管理类权限点。

#### Scenario: 权限点定义
- **GIVEN** 权限点列表已初始化
- **WHEN** SYSTEM_ADMIN 查看 `/admin/permissions`
- **THEN** 看到按 module 分组的完整权限点列表（用户/班级/题目/竞赛/训练/系统等模块）

#### Scenario: 角色默认权限集
- **GIVEN** 三个系统级角色
- **WHEN** SYSTEM_ADMIN 查看 `/admin/roles`
- **THEN** 可以查看/编辑每个角色的默认权限点
- **AND** 编辑后立即生效，影响该角色所有用户

### Requirement: 用户级权限覆盖

系统 SHALL 允许 SYSTEM_ADMIN 为单个用户添加/移除权限点（`UserPermission`），覆盖默认角色权限集。

#### Scenario: 单用户额外授权
- **GIVEN** TEACHER 张三默认没有 `contest.delete` 权限
- **WHEN** SYSTEM_ADMIN 在 `/admin/users/zhangsan/permissions` 勾选 `contest.delete`
- **THEN** 张三额外获得该权限
- **AND** 其他 TEACHER 仍无此权限

#### Scenario: 单用户权限回收
- **GIVEN** STUDENT 李四被 SYSTEM_ADMIN 临时授予 `class.create`
- **WHEN** SYSTEM_ADMIN 取消该勾选
- **THEN** 李四立即失去 `class.create` 权限

### Requirement: 后台访问限制

系统 SHALL 限制 `/admin/*` 路由仅 `SYSTEM_ADMIN` 可访问。`TEACHER` 即使拥有业务管理类权限点，也不能进入管理后台。

#### Scenario: 教师访问后台被拒
- **GIVEN** 张三是 TEACHER
- **WHEN** 张三访问 `/admin/users`
- **THEN** middleware 拦截并 302 跳转到 `/403` 页面
- **AND** 前端 AdminLayout 也不会渲染（直接 redirect）

#### Scenario: 系统管理员正常访问
- **GIVEN** 张三是 SYSTEM_ADMIN
- **WHEN** 张三访问 `/admin/users`
- **THEN** 正常渲染后台布局

### Requirement: 统一权限校验接口

系统 SHALL 提供 `hasPermission(user, code)` 单一接口，所有 API/页面权限校验收敛到该接口。**禁止**在业务代码中直接判断 `user.role === 'ADMIN'` 等字符串比较。

#### Scenario: API 权限校验
- **GIVEN** API 路由需要 `problem.create` 权限
- **WHEN** 用户调用该 API
- **THEN** `withPermission('problem.create')` 中间件检查用户权限
- **AND** 无权限返回 403

#### Scenario: 前端按钮权限
- **GIVEN** 教师张三拥有 `class.create` 权限但没有 `class.delete`
- **WHEN** 张三访问班级详情页
- **THEN** "创建班级"按钮可见
- **AND** "删除班级"按钮隐藏（基于 `usePermission('class.delete')`）

### Requirement: 权限数据迁移

系统 SHALL 提供一次性迁移脚本：扫描现有 User 数据，按以下规则回填到新模型：
- `isSuperAdmin=true` → `role=SYSTEM_ADMIN`
- `isAdmin=true`（且非 SUPER_ADMIN）→ `role=TEACHER`
- 其他 → `role=STUDENT`
- 移除 `isAdmin` 字段

#### Scenario: 现有数据迁移
- **GIVEN** 现有 5 个 User：1 个 SUPER_ADMIN、2 个 ADMIN、2 个普通 USER
- **WHEN** 执行迁移脚本
- **THEN** 1 个 SYSTEM_ADMIN、2 个 TEACHER、2 个 STUDENT
- **AND** 迁移后首个用户可正常登录并访问后台

## MODIFIED Requirements

### Requirement: 班级内部角色判定（ClassMember）

班级内部的 `ClassMember.role` 仍为 `teacher/assistant/student` 三种，但**与系统级 `User.role` 完全解耦**——班级内 `teacher` 可由系统级 STUDENT 担任；进入后台只看系统级 `role`。

#### Scenario: 系统级 STUDENT 担任班级内 teacher
- **GIVEN** 王五是系统级 STUDENT，但加入了某班级并被设为班级内 `teacher` 角色
- **WHEN** 王五访问班级后台（班级管理页）
- **THEN** 可正常管理本班级
- **AND** 访问 `/admin/*` 仍被拒绝（系统级 STUDENT）

## REMOVED Requirements

### Requirement: 旧 `isAdmin` 字段

**Reason**：与 `role` 字段语义重复，导致双源真相与混乱判断（如 `isAdmin` 与 `role` 不一致时无明确优先级）。

**Migration**：迁移脚本中把所有 `isAdmin=true` 的用户归为 `TEACHER`，移除字段。代码中所有 `user.isAdmin` 引用替换为 `user.role === 'SYSTEM_ADMIN' || user.role === 'TEACHER'` 或对应的 `hasPermission` 调用。

### Requirement: 旧 `canAccessAdmin` / `canCreateContest` 等粗粒度函数

**Reason**：基于角色字符串的粗粒度判断，不支持细粒度权限。

**Migration**：用 `hasPermission(user, 'contest.create')` / `hasPermission(user, 'admin.access')` 替代。`canAccessAdmin` 改为仅 `SYSTEM_ADMIN` 通过；`canCreateContest` 改为 `hasPermission('contest.create')`。
