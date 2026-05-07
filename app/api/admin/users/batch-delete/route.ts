import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { userIds } = body

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'userIds 必须是非空数组' },
        { status: 400 }
      )
    }

    const filteredUserIds = userIds.filter(id => id !== auth.user!.userId)

    if (filteredUserIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '不能删除自己的账号' },
        { status: 400 }
      )
    }

    const superAdmins = await prisma.user.findMany({
      where: {
        id: { in: filteredUserIds },
        isSuperAdmin: true
      },
      select: { id: true }
    })

    const superAdminIds = new Set(superAdmins.map(u => u.id))
    const finalUserIds = filteredUserIds.filter(id => !superAdminIds.has(id))

    if (finalUserIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '选中的用户包含超级管理员，不可被删除' },
        { status: 403 }
      )
    }

    const result = await prisma.user.deleteMany({
      where: {
        id: { in: finalUserIds }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        deletedCount: result.count,
        requestedCount: userIds.length,
        skippedCount: userIds.length - finalUserIds.length
      }
    })
  } catch (error) {
    console.error('批量删除用户失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
