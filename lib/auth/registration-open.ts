/**
 * 是否展示/允许前台自助注册。
 * 与 POST /api/auth/register 对齐：关闭注册时仍允许空库创建首个管理员。
 */
export function isSelfRegistrationOpen(opts: {
  allowRegistration?: boolean
  needsBootstrap?: boolean
}): boolean {
  return opts.allowRegistration === true || opts.needsBootstrap === true
}
