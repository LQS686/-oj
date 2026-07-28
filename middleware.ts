import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getUserFromRequest } from '@/lib/auth'
import { canAccessAdmin, isSystemAdmin, isSystemAdminOnlyPath } from '@/lib/permissions'
import crypto from 'crypto'
import { logger } from '@/lib/logger'

// 写操作方法集合：需进行 CSRF Origin/Referer 校验
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const API_RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/auth/login': { maxRequests: 10, windowMs: 60000 },
  '/api/auth/register': { maxRequests: 5, windowMs: 60000 },
  '/api/auth/forgot-password': { maxRequests: 3, windowMs: 300000 },
  // 通知：WS 推送 + 回前台/重连同步；非轮询
  '/api/notifications': { maxRequests: 60, windowMs: 60000 },
  // 修复 P1：补充限流白名单（之前大量写接口无显式限流）
  '/api/submissions': { maxRequests: 20, windowMs: 60000 },
  '/api/solutions': { maxRequests: 10, windowMs: 60000 },
  '/api/classes': { maxRequests: 20, windowMs: 60000 },
  '/api/search': { maxRequests: 30, windowMs: 60000 },
}

/**
 * P3 修复：带动态路径段的限流规则使用正则匹配。
 *  - 删除原 '/api/comments'（无此路由）
 *  - 实际路由为 /api/contests/[id]/register（报名），不是 /api/contests/[id]/join
 */
const REGEX_RATE_LIMITS: { pattern: RegExp; config: { maxRequests: number; windowMs: number } }[] = [
  { pattern: /^\/api\/contests\/[^/]+\/register$/, config: { maxRequests: 10, windowMs: 60000 } },
]

/**
 * 查找匹配的限流配置：先精确匹配，未命中再走正则规则。
 */
function findRateLimitConfig(pathname: string): { maxRequests: number; windowMs: number } {
  const exact = API_RATE_LIMITS[pathname]
  if (exact) return exact
  for (const rule of REGEX_RATE_LIMITS) {
    if (rule.pattern.test(pathname)) return rule.config
  }
  return { maxRequests: 100, windowMs: 60000 }
}

/**
 * CSRF 防护：写操作必须同源，且禁止「无 Origin 也无 Referer」的模糊放行。
 */
function isAllowedOrigin(request: NextRequest): boolean {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) {
    return true
  }

  const host = request.headers.get('host')
  if (!host) return false

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  if (referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }

  // 无 Origin/Referer 的写请求一律拒绝
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // P1 修复：注入 requestId，便于全链路日志追踪
  const incomingRequestId = request.headers.get('x-request-id')
  const requestId = incomingRequestId && incomingRequestId.length <= 128
    ? incomingRequestId
    : crypto.randomUUID()
  logger.setContext({ requestId })

  // 拦截 /admin/* 页面路由（不含 /api/admin/*）：
  // 基于 JWT payload 中的 role 判定，仅 SYSTEM_ADMIN 和 ADMIN 可放行；
  // 系统设置 / 系统公告等路径另需 SYSTEM_ADMIN。
  // /api/admin/* 由 API 路由的 withApi.admin / withApi.systemAdmin 处理，此处不拦截。
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    const payload = getUserFromRequest(request)
    if (!payload) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      const redirect = NextResponse.redirect(loginUrl)
      redirect.headers.set('x-request-id', requestId)
      return redirect
    }
    if (!canAccessAdmin({ role: payload.role })) {
      const redirect = NextResponse.redirect(new URL('/403', request.url))
      redirect.headers.set('x-request-id', requestId)
      return redirect
    }
    if (isSystemAdminOnlyPath(pathname) && !isSystemAdmin({ role: payload.role })) {
      const redirect = NextResponse.redirect(new URL('/403', request.url))
      redirect.headers.set('x-request-id', requestId)
      return redirect
    }
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    // CSRF：同源 Origin/Referer + 双提交 Cookie（/api/auth/csrf 自身除外）
    if (WRITE_METHODS.has(request.method.toUpperCase())) {
      if (!isAllowedOrigin(request)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '跨站请求被拒绝', code: 'CSRF_REJECTED' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (pathname !== '/api/auth/csrf') {
        const { verifyCsrfToken } = await import('@/lib/security/csrf')
        if (!verifyCsrfToken(request)) {
          return new NextResponse(
            JSON.stringify({
              success: false,
              error: 'CSRF token 缺失或校验失败',
              code: 'CSRF_INVALID',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    const baseConfig = findRateLimitConfig(pathname)

    const ip = getClientIP(request)
    // unknown IP 施加更严格限流（默认值的 50%），防止无代理头请求共用桶被滥用
    const isUnknown = ip === 'unknown'
    const maxRequests = isUnknown
      ? Math.max(1, Math.floor(baseConfig.maxRequests * 0.5))
      : baseConfig.maxRequests

    const result = await checkRateLimit(`mw:${ip}:${pathname}`, {
      maxRequests,
      windowMs: baseConfig.windowMs,
      keyPrefix: 'middleware'
    })

    if (!result.success) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: '请求过于频繁，请稍后再试',
          retryAfter: result.retryAfter,
          code: 'RATE_LIMITED'
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(result.retryAfter || 60),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(result.remaining),
          }
        }
      )
    }
  }

  // P1 修复：把 requestId 注入响应头，便于客户端在浏览器 DevTools Network 面板追溯
  const response = NextResponse.next()
  response.headers.set('x-request-id', requestId)
  return response
}

// middleware 需解析 JWT（jsonwebtoken 为 Node 库），使用 Node.js runtime
export const runtime = 'nodejs'

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
}
