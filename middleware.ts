import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserFromRequest } from '@/lib/auth'
import { canAccessAdmin } from '@/lib/permissions'

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  if (realIP) {
    return realIP
  }
  return 'unknown'
}

const API_RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/auth/login': { maxRequests: 10, windowMs: 60000 },
  '/api/auth/register': { maxRequests: 5, windowMs: 60000 },
  '/api/auth/forgot-password': { maxRequests: 3, windowMs: 300000 },
  // 高频轮询接口：navbar 30s 轮询 + AdminLayout 30s 轮询，放宽至 200/min
  '/api/notifications': { maxRequests: 200, windowMs: 60000 },
  // AI 生成日志轮询：2s 间隔，单任务 30 次/min，多任务并发可能更高
  '/api/admin/ai/generate': { maxRequests: 200, windowMs: 60000 },
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
    const rateLimitConfig = API_RATE_LIMITS[pathname] || { maxRequests: 100, windowMs: 60000 }

    const ip = getClientIP(request)
    const result = await checkRateLimit(`mw:${ip}:${pathname}`, {
      maxRequests: rateLimitConfig.maxRequests,
      windowMs: rateLimitConfig.windowMs,
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
