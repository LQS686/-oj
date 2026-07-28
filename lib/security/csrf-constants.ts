/**
 * 客户端安全的 CSRF 常量（无 crypto / NextRequest / withApi 依赖）
 */
export const CSRF_HEADER = 'x-csrf-token'

export const CSRF_CONSTANTS = {
  HEADER: CSRF_HEADER,
} as const
