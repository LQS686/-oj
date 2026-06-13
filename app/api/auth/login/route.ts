/**
 * POST /api/auth/login - 用户登录
 *
 * 迁移到 withApi 中间件模式（使用 NextResponse 以便设置 cookie）
 */
import { NextResponse } from 'next/server'
import { withApi, readJson, fail } from '@/lib/api/withApi'
import { authService } from '@/services/authService'
import { authRateLimiter } from '@/lib/rate-limit'

export const POST = withApi.public(async (req) => {
  const rateLimitResponse = await authRateLimiter(req)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const body = await readJson<{ username: string; password: string }>(req)
  const { username, password } = body

  try {
    const result = await authService.login({ username, password })

    const response = NextResponse.json({
      ok: true,
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
    })

    response.cookies.set('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch (error: any) {
    // 业务错误码对应
    const msg = error?.message
    if (msg === '请输入用户名和密码') return fail('BAD_REQUEST', msg, 400)
    if (msg === '用户名格式不正确') return fail('BAD_REQUEST', msg, 400)
    if (msg === '用户名或密码错误') return fail('UNAUTHORIZED', msg, 401)
    if (msg === '账号已被封禁') return fail('FORBIDDEN', msg, 403)
    throw error
  }
})
