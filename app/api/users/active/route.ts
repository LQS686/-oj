
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/users/active - 获取活跃用户列表（目前按 Rating 排序）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')

    // 1. 聚合统计发帖数
    const postCounts = await prisma.post.groupBy({
      by: ['authorId'],
      _count: {
        id: true
      },
      where: {
        isDeleted: false,
        status: 'published'
      }
    })

    // 2. 聚合统计评论数
    const commentCounts = await prisma.comment.groupBy({
      by: ['authorId'],
      _count: {
        id: true
      },
      where: {
        isDeleted: false
      }
    })

    // 3. 计算总活跃度 (发帖权重 3，评论权重 1)
    const userScores = new Map<string, number>()

    postCounts.forEach(item => {
      const userId = item.authorId
      const count = item._count.id
      userScores.set(userId, (userScores.get(userId) || 0) + count * 3)
    })

    commentCounts.forEach(item => {
      const userId = item.authorId
      const count = item._count.id
      userScores.set(userId, (userScores.get(userId) || 0) + count)
    })

    // 4. 排序并取前 N 名
    const sortedUserIds = Array.from(userScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0])

    // 5. 获取用户详情
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: sortedUserIds
        }
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        rating: true,
        color: true,
        avatar: true,
        _count: {
          select: {
            posts: { where: { isDeleted: false, status: 'published' } },
            comments: { where: { isDeleted: false } }
          }
        }
      },
    })

    // 6. 按活跃度排序返回 (因为 findMany 不保证顺序)
    // 重新计算分数用于排序展示（如果需要）或者直接按 sortedUserIds 顺序
    const sortedUsers = sortedUserIds
      .map(id => users.find(u => u.id === id))
      .filter(u => u !== undefined)
      
    return NextResponse.json({
      success: true,
      data: sortedUsers,
    })
  } catch (error) {
    console.error('获取活跃用户失败:', error)
    return NextResponse.json(
      { success: false, error: '获取活跃用户失败' },
      { status: 500 }
    )
  }
}
