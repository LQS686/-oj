import { NextRequest, NextResponse } from 'next/server'

// POST /api/auth/logout - 用户登出
export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: '登出成功',
  })

  // 清除 cookie
  response.cookies.delete('token')

  return response
}
