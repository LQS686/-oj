
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { createPostLikeDirect, deletePostLikeDirect, checkPostLikeDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    // Check if already liked using direct MongoDB access
    const isLiked = await checkPostLikeDirect(currentUser.userId, id)

    if (isLiked) {
      // Unlike
      await deletePostLikeDirect(currentUser.userId, id)
      return NextResponse.json({
        success: true,
        data: { isLiked: false },
        message: '已取消点赞',
      })
    } else {
      // Like
      const success = await createPostLikeDirect(currentUser.userId, id)
      // Even if duplicate (success=false), we return isLiked=true because the intent was to like
      return NextResponse.json({
        success: true,
        data: { isLiked: true },
        message: '点赞成功',
      })
    }
  } catch (error) {
    logger.error('点赞操作错误', error)
    return NextResponse.json(
      { success: false, error: '操作失败' },
      { status: 500 }
    )
  }
}
