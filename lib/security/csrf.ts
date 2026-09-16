/**
 * lib/security/csrf.ts
 * CSRF 双提交 Cookie（Double Submit Cookie）
 *
 * - 写方法必须带 X-CSRF-Token，与可读 Cookie timing-safe 相等
 * - Cookie 名由部署模式唯一决定：HTTPS → __Host-csrf；本地 HTTP → csrf
 * - 不接受 Bearer 旁路（会话仅 Cookie）
 */
import 'server-only'

import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import crypto from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { isSecureAuthCookie } from '@/lib/auth/cookie'
import { CSRF_HEADER, CSRF_CONSTANTS } from './csrf-constants'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export { CSRF_HEADER, CSRF_CONSTANTS }

export function csrfCookieName(secure: boolean = isSecureAuthCookie()): string {
  return secure ? '__Host-csrf' : 'csrf'
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function setCsrfCookie(response: NextResponse, token: string = generateCsrfToken()): string {
  const secure = isSecureAuthCookie()
  const name = csrfCookieName(secure)
  response.cookies.set(name, token, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return token
}

export function clearCsrfCookie(response: NextResponse): void {
  const secure = isSecureAuthCookie()
  const name = csrfCookieName(secure)
  response.cookies.set(name, '', {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

export function readCsrfCookie(req: NextRequest): string | null {
  return req.cookies.get(csrfCookieName())?.value || null
}

export function verifyCsrfToken(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true

  const headerToken = req.headers.get(CSRF_HEADER)?.trim()
  const cookieToken = readCsrfCookie(req)?.trim()
  if (!headerToken || !cookieToken) return false
  if (headerToken.length !== cookieToken.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
  } catch {
    return false
  }
}

export function assertCsrf(req: NextRequest): void {
  if (!verifyCsrfToken(req)) {
    throw new ApiError('CSRF_INVALID', 'CSRF token 缺失或校验失败', 403)
  }
}

/**
 * 从标准 Request 的 Cookie 头中读取 CSRF cookie。
 * 用于被移出 proxy matcher 的大体积上传路由（这些路由拿到的不是 NextRequest）。
 */
function readCsrfCookieFromRequest(req: Request): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  const name = csrfCookieName()
  const kv = header
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
  return kv ? kv.slice(name.length + 1) : null
}

/**
 * 大体积上传路由防护：为已从全局 proxy matcher 排除的路由（保持请求体真流式、
 * 避免 Next 默认 10MB body-clone 截断）提供与全局中间件等价的同源 + 双提交 Cookie 校验。
 * 写方法必须同源（Origin/Referer），且 X-CSRF-Token 与 Cookie timing-safe 相等。
 * @returns 校验失败时返回错误 Response；通过返回 null。
 */
export function guardLargeUploadRequest(req: Request): Response | null {
  const method = req.method.toUpperCase()
  if (SAFE_METHODS.has(method)) return null

  const bad = (code: string, msg: string): Response =>
    new Response(JSON.stringify({ success: false, error: msg, code }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

  // 同源校验（与 middleware.isAllowedOrigin 保持一致）
  const host = req.headers.get('host')
  if (!host) return bad('CSRF_REJECTED', '跨站请求被拒绝')
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  let sameOrigin = false
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === host
    } catch {
      sameOrigin = false
    }
  } else if (referer) {
    try {
      sameOrigin = new URL(referer).host === host
    } catch {
      sameOrigin = false
    }
  }
  if (!sameOrigin) return bad('CSRF_REJECTED', '跨站请求被拒绝')

  // 双提交 Cookie（与 verifyCsrfToken 一致）
  const headerToken = req.headers.get(CSRF_HEADER)?.trim()
  const cookieToken = readCsrfCookieFromRequest(req)?.trim()
  if (
    !headerToken ||
    !cookieToken ||
    headerToken.length !== cookieToken.length ||
    !crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
  ) {
    return bad('CSRF_INVALID', 'CSRF token 缺失或校验失败')
  }
  return null
}
