import { NextRequest, NextResponse } from 'next/server'
import { authService } from '@/services/authService'
import { success, badRequest, unauthorized, forbidden } from '@/lib/api-response'
import { errorHandler } from '@/lib/error-handler'
import { logger } from '@/lib/logger'
import { errorMonitor } from '@/lib/error-monitor'
import { authRateLimiter } from '@/lib/rate-limit'

// POST /api/auth/login - 用户登录
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await authRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body = await request.json()
    const { username, password } = body

    const result = await authService.login({ username, password })

    const response = success(
      {
        user: result.user,
        token: result.token,
      },
      '登录成功'
    )

    response.cookies.set('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch (error: any) {
    logger.error('登录错误', error)
    await errorMonitor.trackError(error, { errorType: 'auth', endpoint: '/api/auth/login' })
    if (error.message === '请输入用户名和密码') {
      return badRequest(error.message)
    } else if (error.message === '用户名格式不正确') {
      return badRequest(error.message)
    } else if (error.message === '用户名或密码错误') {
      return unauthorized(error.message)
    } else if (error.message === '账号已被封禁') {
      return forbidden(error.message)
    }
    return errorHandler.handle(error, request)
  }
}
