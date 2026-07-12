import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getUserFromRequest } from '@/lib/auth'
import { canAccessAdmin } from '@/lib/permissions'

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
    return true // 无 Host 头时放行（异常环境由上游处理）
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

  // 拦截 /admin/* 页面路由（不含 /api/admin/*）：
  // 基于 JWT payload 中的 role 判定，仅 SYSTEM_ADMIN 和 ADMIN 可放行。
  // /api/admin/* 由 API 路由的 withApi.admin 处理，此处不拦截。
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    const payload = getUserFromRequest(request)
    if (!payload || !canAccessAdmin({ role: payload.role })) {
      return NextResponse.redirect(new URL('/403', request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    // CSRF 校验：写操作必须同源
    if (!isAllowedOrigin(request)) {
      return new NextResponse(
        JSON.stringify({ success: false, error: '跨站请求被拒绝' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const baseConfig = API_RATE_LIMITS[pathname] || { maxRequests: 100, windowMs: 60000 }

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
          retryAfter: result.retryAfter
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

  return NextResponse.next()
}

// middleware 需解析 JWT（jsonwebtoken 为 Node 库），使用 Node.js runtime
export const runtime = 'nodejs'

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
}
