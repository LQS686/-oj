import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        action: 'UPDATE_PROBLEM_SOURCE'
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to last 100 logs
    })

    return NextResponse.json({
      success: true,
      data: logs
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '服务器错误: ' + error.message }, { status: 500 })
  }
}
