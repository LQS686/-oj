/**
 * lib/security/csrf.ts
 * CSRF token 工具（P1-4 修复）
 *
 * 策略：
 *  - 写方法（POST/PUT/PATCH/DELETE）的公开 API 必须携带 csrf token
 *  - token 通过双 token 模式（access cookie + header）防止 CSRF
 *  - 已登录用户（Bearer token / 已通过 withApi.auth）不受 CSRF 检查
 *    （因为已经是 token-based auth，不再依赖 cookie 自动提交）
 *  - 仅对 withApi.public 包装的写方法做强制
 *
 * 用法：
 *   - 在 withApi.public 内对非 GET/HEAD/OPTIONS 方法调用 assertCsrf(req)
 *   - 前端在每次写操作前调用 ensureCsrfToken() 获取并设置 X-CSRF-Token header
 */

import type { NextRequest } from 'next/server'
import crypto from 'crypto'
import { ApiError } from '@/lib/api/withApi'

const CSRF_HEADER = 'x-csrf-token'
const CSRF_COOKIE = 'csrf-token'
const CSRF_FORM_FIELD = '_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function getSecret(): string {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'CSRF_SECRET 未设置！请在 .env 中配置 CSRF_SECRET（可与 JWT_SECRET 共用）。'
    )
  }
  return secret
}

/**
 * 生成新的 CSRF token（同步生成 access token 与 cookie value）
 */
export function generateCsrfTokenPair(): { token: string; cookieValue: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const secret = getSecret()
  const cookieValue = crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('hex')
  return { token, cookieValue }
}

/**
 * 校验：请求头中的 token 与 cookie 中的 HMAC 值是否匹配
 */
export function verifyCsrfToken(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true

  // 已认证请求（Bearer token）跳过 CSRF 检查
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return true
  }

  const headerToken = req.headers.get(CSRF_HEADER)
  const cookieValue = req.cookies.get(CSRF_COOKIE)?.value
  if (!headerToken || !cookieValue) return false

  const secret = getSecret()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(headerToken)
    .digest('hex')

  // 长度固定 + 常时比较，防止计时攻击
  if (expected.length !== cookieValue.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cookieValue))
}

/**
 * 在 withApi.public 内调用的便捷断言
 */
export function assertCsrf(req: NextRequest): void {
  if (!verifyCsrfToken(req)) {
    throw new ApiError('CSRF_INVALID', 'CSRF token 缺失或校验失败', 403)
  }
}

/**
 * 将 CSRF token 写入 cookie 的辅助方法（供登录/注册成功后调用）
 */
export function attachCsrfCookieHeaders(
  token: string,
  cookieValue: string,
  isSecure: boolean
): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: CSRF_COOKIE,
    value: cookieValue,
    options: {
      httpOnly: false, // 允许前端 JS 读取后回填 header
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    },
  }
}

export const CSRF_CONSTANTS = {
  HEADER: CSRF_HEADER,
  COOKIE: CSRF_COOKIE,
  FORM_FIELD: CSRF_FORM_FIELD,
} as const