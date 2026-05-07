import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { updatePostDirect, softDeletePostDirect } from '@/lib/mongodb-direct'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// PATCH /api/admin/posts/[id] - 更新帖子状态（置顶/锁定）
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // 使用 MongoDB 原生驱动直接更新，绕过 Prisma 事务限制
    // 因为当前 MongoDB 可能运行在单机模式，不支持事务
    await updatePostDirect(id, body)

    // 为了返回一致的格式，我们可以重新获取帖子
    // 这里使用 Prisma 获取是安全的，因为只是读取
    const post = await prisma.post.findUnique({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      data: post
    })
  } catch (error) {
    console.error('更新帖子失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/posts/[id] - 删除帖子（逻辑删除）
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 使用 MongoDB 原生驱动直接删除（逻辑删除），绕过 Prisma 事务限制
    await softDeletePostDirect(id)

    return NextResponse.json({
      success: true,
      message: '帖子已删除'
    })
  } catch (error) {
    console.error('删除帖子失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
