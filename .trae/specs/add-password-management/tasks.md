# Tasks

- [x] Task 1: 修复用户修改自己密码的 HTTP 方法 Bug
  - [x] SubTask 1.1: `app/settings/page.tsx` — `handlePasswordChange` 中 `method: 'PATCH'` 改为 `method: 'PUT'`

- [x] Task 2: 管理员重置密码后端限制为仅 SYSTEM_ADMIN
  - [x] SubTask 2.1: `app/api/admin/users/[id]/route.ts` — PATCH handler 中，当 `body.password` 非空时校验 `isSystemAdmin(user)`，否则返回 403

- [x] Task 3: 管理员重置密码前端 UI（独立操作）
  - [x] SubTask 3.1: `app/admin/users/page.tsx` — 新增 `resetTarget` / `resetPassword` / `resetPasswordConfirm` / `resetting` state
  - [x] SubTask 3.2: 用户列表操作列新增独立的"重置密码"按钮（KeyRound 图标，仅 SYSTEM_ADMIN 可见）
  - [x] SubTask 3.3: 新增独立的重置密码对话框（新密码 + 确认密码）
  - [x] SubTask 3.4: `handleResetPassword` 仅发送 `{ password }` 字段
  - [x] SubTask 3.5: 编辑角色对话框移除密码输入框，恢复为纯角色编辑

# Task Dependencies
- [Task 3] 依赖 [Task 2]（后端校验就绪后前端才能正确调用）
- [Task 1] 独立，可与 [Task 2] [Task 3] 并行
