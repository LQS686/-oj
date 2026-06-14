/**
 * lib/permissions/guard.ts
 * 服务端权限守卫：抛错式 + 异常类型
 */

import type { PermissionCode, PermissionUser } from './types'
import { hasPermission } from './permissions'

/**
 * 权限拒绝异常（业务异常，可在 API 层捕获后转为 403）
 */
export class PermissionDeniedError extends Error {
  public code: string
  public permissionCode: PermissionCode
  constructor(permissionCode: PermissionCode, message?: string) {
    super(message ?? `PERMISSION_DENIED: ${permissionCode}`)
    this.name = 'PermissionDeniedError'
    this.code = 'PERMISSION_DENIED'
    this.permissionCode = permissionCode
  }
}

/**
 * 检查用户是否拥有指定权限点；无权限时抛出 PermissionDeniedError
 */
export async function requirePermission(
  user: PermissionUser | null | undefined,
  code: PermissionCode
): Promise<void> {
  const ok = await hasPermission(user, code)
  if (!ok) {
    throw new PermissionDeniedError(code)
  }
}
