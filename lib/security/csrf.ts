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
