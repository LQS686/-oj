import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getUserFromRequest } from '@/lib/auth'
import { canAccessAdmin } from '@/lib/permissions'
import crypto from 'crypto'
import { logger } from '@/lib/logger'

// 写操作方法集合：需进行 CSRF Origin/Referer 校验
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const API_RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/auth/login': { maxRequests: 10, windowMs: 60000 },
  '/api/auth/register': { maxRequests: 5, windowMs: 60000 },
  '/api/auth/forgot-password': { maxRequests: 3, windowMs: 300000 },
  // 高频轮询接口：navbar 30s 轮询 + AdminLayout 30s 轮询，放宽至 200/min
  '/api/notifications': { maxRequests: 200, windowMs: 60000 },
  // AI 生成日志轮询：2s 间隔，单任务 30 次/min，多任务并发可能更高
  '/api/admin/ai/generate': { maxRequests: 200, windowMs: 60000 },
  // 修复 P1：补充限流白名单（之前大量写接口无显式限流）
  '/api/submissions': { maxRequests: 20, windowMs: 60000 },
  '/api/solutions': { maxRequests: 10, windowMs: 60000 },
  '/api/classes': { maxRequests: 20, windowMs: 60000 },
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
 * CSRF 防护：对写操作校验 Origin / Referer，防止跨站请求伪造。
 * 同源判定：Origin 或 Referer 的 host 必须与当前请求 Host 一致。
 */
function isAllowedOrigin(request: NextRequest): boolean {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) {
    return true
  }

  const host = request.headers.get('host')
  if (!host) {
    // 修复 P0：无 Host 头视为异常，fail-closed 拒绝写方法。
    //   仅读取 Host 失败时（理论上不应发生在 Next.js）才放行。
    return false
  }

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  // 优先校验 Origin
  if (origin) {
    try {
      const originHost = new URL(origin).host
      return originHost === host
    } catch {
      return false
    }
  }

  // Origin 缺失时回退到 Referer
  if (referer) {
    try {
      const refererHost = new URL(referer).host
      return refererHost === host
    } catch {
      return false
    }
  }

  // 同源 POST 且无 Origin/Referer：浏览器同源请求至少会携带 Referer
  // 缺失两者可能是非浏览器客户端（curl / 服务端调用），放行由鉴权层处理
  return true
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
  // 基于 JWT payload 中的 role 判定，仅 SYSTEM_ADMIN 和 ADMIN 可放行。
  // /api/admin/* 由 API 路由的 withApi.admin 处理，此处不拦截。
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    const payload = getUserFromRequest(request)
    if (!payload || !canAccessAdmin({ role: payload.role })) {
      const redirect = NextResponse.redirect(new URL('/403', request.url))
      redirect.headers.set('x-request-id', requestId)
      return redirect
    }
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    // CSRF 校验：写操作必须同源
    if (!isAllowedOrigin(request)) {
      return new NextResponse(
        JSON.stringify({ ok: false, success: false, error: '跨站请求被拒绝', code: 'CSRF_REJECTED' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
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
          ok: false,
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
