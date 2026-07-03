import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

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
}

/**
 * 解析 JWT payload（不验证签名），用于快速判断 token 角色。
 * 使用 Web Crypto API 校验 HS256 签名，兼容 edge / node runtime。
 */
async function isAdminPayload(token: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [headerB64, payloadB64, signatureB64] = parts

    const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
    const keyMaterial = new TextEncoder().encode(secret)
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // base64url -> Uint8Array
    const sigB64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/')
    const sigPadded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4)
    const sigBin = Uint8Array.from(atob(sigPadded), (c) => c.charCodeAt(0))

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const valid = await crypto.subtle.verify('HMAC', key, sigBin, signedData)
    if (!valid) return false

    const payloadB64Std = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const payloadPadded = payloadB64Std + '='.repeat((4 - (payloadB64Std.length % 4)) % 4)
    const payloadJson = atob(payloadPadded)
    const payload = JSON.parse(payloadJson) as {
      role?: string
    }

    return payload.role === 'SYSTEM_ADMIN'
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 拦截 /admin/* 路径：仅 SYSTEM_ADMIN 可访问
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/403', request.url))
    }
    const ok = await isAdminPayload(token)
    if (!ok) {
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

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
}
