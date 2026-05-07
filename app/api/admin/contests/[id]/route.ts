import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// GET /api/admin/contests/[id] - 获取单个竞赛详情
export async function GET(
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

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        problems: {
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                difficulty: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: contest
    })
  } catch (error) {
    console.error('获取竞赛详情失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/contests/[id] - 更新竞赛
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
    const { 
      title, 
      description, 
      type, 
      startTime, 
      endTime, 
      isPublic, 
      password,
      problems // Array of problemIds
    } = body

    const updateData: any = {
      title,
      description,
      type,
      isPublic,
      password: password || null
    }

    if (startTime && endTime) {
      const start = new Date(startTime)
      const end = new Date(endTime)
      const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60)
      
      if (duration <= 0) {
        return NextResponse.json(
          { success: false, error: '结束时间必须晚于开始时间' },
          { status: 400 }
        )
      }
      
      updateData.startTime = start
      updateData.endTime = end
      updateData.duration = duration
    }

    // 改为非事务处理以兼容 standalone MongoDB
    // 1. 更新基本信息
    await prisma.contest.update({
      where: { id },
      data: updateData
    })

    // 2. 如果提供了题目列表，更新题目关联
    if (problems && Array.isArray(problems)) {
      // 删除原有题目关联
      await prisma.contestProblem.deleteMany({
        where: { contestId: id }
      })

      // 添加新题目关联
      if (problems.length > 0) {
        await prisma.contestProblem.createMany({
          data: problems.map((problemId: string, index: number) => ({
            contestId: id,
            problemId,
            orderIndex: index + 1,
            score: 100 // 默认分数，后续可以细化
          }))
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: '更新成功'
    })
  } catch (error) {
    console.error('更新竞赛失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/contests/[id] - 删除竞赛
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

    // 删除竞赛（级联删除会处理关联数据，如 ContestProblem）
    // 但注意 Prisma MongoDB 不支持完全的数据库级联，需要 schema 里定义 onDelete: Cascade 或者手动删除
    // schema 中 ContestProblem 有 onDelete: Cascade 指向 Contest，所以 Prisma Client 会处理
    await prisma.contest.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: '删除成功'
    })
  } catch (error) {
    console.error('删除竞赛失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
