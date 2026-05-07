import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import bcrypt from 'bcryptjs'

// GET /api/contests/[id] - 获取竞赛详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = getUserFromRequest(request)

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        _count: {
          select: {
            participants: true,
            problems: true,
          },
        },
      },
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    // 检查是否已报名
    let isRegistered = false
    if (currentUser) {
      const participant = await prisma.contestParticipant.findUnique({
        where: {
          contestId_userId: {
            contestId: id,
            userId: currentUser.userId,
          },
        },
      })
      isRegistered = !!participant
    }

    return NextResponse.json({
      success: true,
      data: {
        ...contest,
        isRegistered,
      },
    })
  } catch (error) {
    logger.error('获取竞赛详情错误', error)
    return NextResponse.json(
      { success: false, error: '获取竞赛详情失败' },
      { status: 500 }
    )
  }
}

// PUT /api/contests/[id] - 更新竞赛信息
export async function PUT(
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

    const contest = await prisma.contest.findUnique({
      where: { id },
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    // 只有创建者或管理员可以修改
    if (contest.authorId !== currentUser.userId && !currentUser.isAdmin) {
      return NextResponse.json(
        { success: false, error: '无权修改此竞赛' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const hashedPassword = body.password
      ? await bcrypt.hash(body.password, 12)
      : body.password === null || body.password === ''
        ? null
        : undefined

    const updatedContest = await prisma.contest.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        type: body.type,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
        duration: body.duration,
        isPublic: body.isPublic,
        password: hashedPassword,
      },
    })

    // Update problems if provided
    if (body.problemIds && Array.isArray(body.problemIds)) {
      // 1. Delete existing relations
      await prisma.contestProblem.deleteMany({
        where: { contestId: id }
      })

      // 2. Create new relations
      if (body.problemIds.length > 0) {
        await prisma.contestProblem.createMany({
          data: body.problemIds.map((problemId: string, index: number) => ({
            contestId: id,
            problemId: problemId,
            orderIndex: index,
            score: 100 // Default score
          }))
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedContest,
      message: '竞赛更新成功',
    })
  } catch (error) {
    logger.error('更新竞赛错误', error)
    return NextResponse.json(
      { success: false, error: '更新竞赛失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/contests/[id] - 删除竞赛
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = await getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    // 只有创建者或管理员可以删除
    if (contest.authorId !== currentUser.userId && !currentUser.isAdmin) {
      return NextResponse.json(
        { success: false, error: '无权删除此竞赛' },
        { status: 403 }
      )
    }

    await prisma.contest.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '竞赛删除成功',
    })
  } catch (error) {
    logger.error('删除竞赛错误', error)
    return NextResponse.json(
      { success: false, error: '删除竞赛失败' },
      { status: 500 }
    )
  }
}
