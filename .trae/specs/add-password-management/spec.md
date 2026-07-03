# 用户密码管理功能 Spec

## Why

当前项目密码管理存在两处缺口：1) 用户修改自己密码的前端调用 HTTP 方法与后端不匹配（前端 PATCH、后端 PUT），导致功能不可用；2) 管理员重置用户密码的后端逻辑已就绪（`adminUpdateUser` 支持 password 字段），但前端编辑对话框无密码输入框，且未限制为仅 SYSTEM_ADMIN 可操作。需要补齐这两处功能并修复 Bug。

## What Changes

### 一、修复用户修改自己密码的 Bug

- `app/settings/page.tsx`：`handlePasswordChange` 中的 `method: 'PATCH'` 改为 `method: 'PUT'`，与后端 `/api/users/profile/password` 路由导出的 `PUT` 方法匹配

### 二、管理员重置用户密码限制为仅 SYSTEM_ADMIN

- `app/api/admin/users/[id]/route.ts`：PATCH handler 中，当 `body.password` 非空时，校验当前操作者为 SYSTEM_ADMIN，否则返回 403
- 保留 `withApi.admin` 包装（ADMIN 仍可修改 TEACHER/STUDENT 的 role/isBanned，但不能重置密码）

### 三、管理员重置密码前端 UI（独立操作）

- `app/admin/users/page.tsx` 用户列表操作列新增独立的"重置密码"按钮（KeyRound 图标），仅 SYSTEM_ADMIN 可见
- 点击按钮弹出独立的重置密码对话框（含新密码 + 确认密码两个输入框），与编辑角色对话框分离
- `handleResetPassword`：仅发送 `{ password }` 字段到 PATCH `/api/admin/users/[id]`
- 编辑角色对话框恢复为纯角色编辑（不含密码字段）

## Impact

- Affected code：
  - `app/settings/page.tsx` — 修复 HTTP 方法
  - `app/api/admin/users/[id]/route.ts` — 密码重置增加 SYSTEM_ADMIN 校验
  - `app/admin/users/page.tsx` — 编辑对话框增加密码输入框

## ADDED Requirements

### Requirement: 管理员重置用户密码

系统 SHALL 允许 SYSTEM_ADMIN 在用户管理编辑对话框中重置任意用户（除自己外的 SYSTEM_ADMIN 不可操作）的密码。ADMIN 不可重置任何用户的密码。

#### Scenario: SYSTEM_ADMIN 重置用户密码
- **GIVEN** 操作者是 SYSTEM_ADMIN
- **WHEN** 在编辑用户对话框中填写新密码并提交
- **THEN** 目标用户密码被更新为 bcrypt 哈希
- **AND** 目标用户无需提供原密码

#### Scenario: ADMIN 不能重置密码
- **GIVEN** 操作者是 ADMIN
- **WHEN** 调用 PATCH `/api/admin/users/[id]` 且 body 包含 password 字段
- **THEN** 返回 403
- **AND** 前端编辑对话框不显示密码输入框

#### Scenario: SYSTEM_ADMIN 不可被重置
- **GIVEN** 目标用户是 SYSTEM_ADMIN
- **WHEN** 尝试重置其密码
- **THEN** 返回 403（`assertCanUpdateUser` 已有保护）

### Requirement: 用户修改自己密码

系统 SHALL 允许用户在设置页面修改自己的密码，需提供当前密码验证。

#### Scenario: 用户修改自己密码成功
- **GIVEN** 用户已登录
- **WHEN** 在 `/settings` 页面填写当前密码、新密码、确认密码并提交
- **THEN** 密码被更新
- **AND** 当前密码验证通过后才允许修改

#### Scenario: 当前密码错误
- **GIVEN** 用户填写了错误的当前密码
- **WHEN** 提交修改
- **THEN** 返回 401，密码不变
