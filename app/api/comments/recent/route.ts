import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/comments/recent - 获取最新评论
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')

    const comments = await prisma.comment.findMany({
      where: {
        isDeleted: false,
        post: {
          isDeleted: false,
          status: 'published'
        }
      },
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            color: true
          }
        },
        post: {
          select: {
            id: true,
            title: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: comments
    })
  } catch (error) {
    console.error('获取最新评论失败:', error)
    return NextResponse.json(
      { success: false, error: '获取最新评论失败' },
      { status: 500 }
    )
  }
}
