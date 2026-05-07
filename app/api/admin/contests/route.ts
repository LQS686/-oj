import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/contests - 获取竞赛列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const contests = await prisma.contest.findMany({
      orderBy: { startTime: 'desc' },
      include: {
        author: {
          select: { username: true }
        },
        _count: {
          select: {
            problems: true,
            participants: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: contests
    })
  } catch (error) {
    console.error('获取竞赛列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// POST /api/admin/contests - 创建竞赛
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
    const { 
      title, 
      description, 
      type, 
      startTime, 
      endTime, 
      isPublic, 
      password,
      problems // Array of problem IDs
    } = body

    if (!title || !description || !startTime || !endTime || !type) {
      return NextResponse.json(
        { success: false, error: '请填写所有必填字段' },
        { status: 400 }
      )
    }

    const start = new Date(startTime)
    const end = new Date(endTime)
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60) // 分钟

    if (duration <= 0) {
      return NextResponse.json(
        { success: false, error: '结束时间必须晚于开始时间' },
        { status: 400 }
      )
    }

    const contest = await prisma.contest.create({
      data: {
        title,
        description,
        type,
        startTime: start,
        endTime: end,
        duration,
        isPublic: isPublic || false,
        password: password || null,
        authorId: auth.user.userId,
        problems: {
            create: problems && Array.isArray(problems) ? problems.map((problemId: string, index: number) => ({
                problemId: problemId,
                orderIndex: index
            })) : []
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: contest
    })
  } catch (error) {
    console.error('创建竞赛失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
