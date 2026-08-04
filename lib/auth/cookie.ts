/**
 * lib/auth/cookie.ts
 * 会话 Cookie：单一名称，无双读兼容。
 *
 * 生产环境强制 __Host-token（必须 HTTPS）。
 * 本地开发可用 token（HTTP）。
 */
import type { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function isSecureAuthCookie(): boolean {
  if (process.env.NODE_ENV === 'production') {
    // 生产禁止非 Secure：__Host- 规范要求
    return true
  }
  return process.env.FORCE_SECURE_COOKIE === 'true'
}

export function authCookieName(secure: boolean = isSecureAuthCookie()): string {
  return secure ? '__Host-token' : 'token'
}

const AUTH_MAX_AGE = 7 * 24 * 60 * 60
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60

export function setAuthCookie(
  response: NextResponse,
  token: string,
  rememberMe = false
): void {
  const secure = isSecureAuthCookie()
  const name = authCookieName(secure)
  response.cookies.set(name, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    priority: 'high',
    path: '/',
    // 「记住我」30 天，否则 7 天（与登录页 rememberMe 开关对应）
    maxAge: rememberMe ? REMEMBER_MAX_AGE : AUTH_MAX_AGE,
  })
}

export function clearAuthCookie(response: NextResponse): void {
  const secure = isSecureAuthCookie()
  const name = authCookieName(secure)
  response.cookies.set(name, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function readAuthTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(authCookieName())?.value || null
}

export function readAuthTokenFromCookieHeader(cookieHeader: string): string | null {
  const name = authCookieName()
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

/** SSR / cookies()：按当前安全模式读取会话 token */
export function readAuthTokenFromCookieStore(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): string | null {
  return cookieStore.get(authCookieName())?.value || null
}
