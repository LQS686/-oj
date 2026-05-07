
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/users/[id]/info - 获取用户公开资料
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        bio: true,
        rating: true,
        rank: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            problems: { where: { isPublic: true } }, // Created public problems
            posts: { where: { status: 'published', isDeleted: false } },
            comments: { where: { isDeleted: false } }
          }
        }
      }
    })

    // Get accepted submissions count
    const acceptedSubmissionsCount = await prisma.submission.count({
      where: {
        userId: id,
        status: 'AC'
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // Extract AC count from _count
    const acCount = acceptedSubmissionsCount

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        acceptedSubmissions: acCount
      }
    })
  } catch (error) {
    console.error('获取用户公开资料失败:', error)
    return NextResponse.json(
      { success: false, error: '获取用户资料失败' },
      { status: 500 }
    )
  }
}
