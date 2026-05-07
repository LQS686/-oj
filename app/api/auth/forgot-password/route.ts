import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: '密码重置功能尚未开放，请联系管理员'
    },
    { status: 501 }
  )
}
