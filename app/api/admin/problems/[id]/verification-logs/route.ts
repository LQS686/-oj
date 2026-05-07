import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
    }

    const logs = await prisma.verificationLog.findMany({
      where: { problemId: id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: logs
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '服务器错误: ' + error.message }, { status: 500 })
  }
}
