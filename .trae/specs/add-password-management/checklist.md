# Checklist

## 用户修改自己密码
- [x] `app/settings/page.tsx` 的 `handlePasswordChange` 使用 `method: 'PUT'` 调用 `/api/users/profile/password`
- [x] 用户填写当前密码、新密码、确认密码后可成功修改密码（后端 `changeCurrentUserPassword` 验证当前密码）

## 管理员重置密码后端
- [x] `app/api/admin/users/[id]/route.ts` PATCH 中，当 body.password 非空时校验操作者为 SYSTEM_ADMIN
- [x] ADMIN 调用含 password 字段的 PATCH 返回 403
- [x] SYSTEM_ADMIN 重置密码成功（bcrypt 哈希存储，`adminUpdateUser` 中 `bcrypt.hash(password, 10)`）

## 管理员重置密码前端（独立操作）
- [x] 用户列表操作列含独立的"重置密码"按钮（KeyRound 图标，仅 SYSTEM_ADMIN 可见）
- [x] 点击按钮弹出独立的重置密码对话框（新密码 + 确认密码两个输入框）
- [x] `handleResetPassword` 仅发送 `{ password }` 字段
- [x] 打开重置对话框时密码字段初始为空
- [x] 编辑角色对话框不再包含密码输入框（纯角色编辑）
- [x] 重置按钮对 SYSTEM_ADMIN 目标禁用（系统管理员密码不可重置）
