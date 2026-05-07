import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/posts - 获取帖子列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false // 默认只看未删除的，如果想看已删除的可以加参数
      },
      include: {
        author: {
          select: { username: true }
        },
        _count: {
          select: {
            comments: true,
            postLikes: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: posts
    })
  } catch (error) {
    console.error('获取帖子列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
