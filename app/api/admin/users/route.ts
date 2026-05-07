import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/users - 获取所有用户列表（管理员）
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 获取所有用户
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatar: true,
        rating: true,
        rank: true,
        isAdmin: true,
        role: true,
        isSuperAdmin: true,
        isBanned: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            problems: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: users
    })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
