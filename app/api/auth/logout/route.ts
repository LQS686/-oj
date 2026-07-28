/**
 * POST /api/auth/logout - 用户登出
 */
import { NextResponse } from 'next/server'
import { withApi } from '@/lib/api/withApi'
import { clearAuthCookie } from '@/lib/auth/cookie'
import { clearCsrfCookie } from '@/lib/security/csrf'

export const POST = withApi.public(async () => {
  const response = NextResponse.json({
    success: true,
    data: { message: '登出成功' },
  })
  clearAuthCookie(response)
  clearCsrfCookie(response)
  return response
})
