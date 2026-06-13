/**
 * POST /api/auth/logout - 用户登出
 *
 * 迁移到 withApi 中间件模式
 */
import { NextResponse } from 'next/server'
import { withApi } from '@/lib/api/withApi'

export const POST = withApi.public(async () => {
  const response = NextResponse.json({
    ok: true,
    success: true,
    data: { message: '登出成功' },
  })
  // 清除 cookie
  response.cookies.delete('token')
  return response
})
