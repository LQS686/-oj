/**
 * 团队单个题目管理 API
 * - GET /api/teams/[id]/problems/[problemId] - 获取团队题目详情
 * - PUT /api/teams/[id]/problems/[problemId] - 更新团队题目
 * - DELETE /api/teams/[id]/problems/[problemId] - 删除团队题目
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; problemId: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/teams/[id]/problems/[problemId] - 获取团队题目详情
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id, problemId } = await context.params
    const teamId = id

    if (!isValidObjectId(teamId) || !isValidObjectId(problemId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 获取题目
    const problem = await prisma.problem.findUnique({
      where: {
        id: problemId,
        teamId: teamId // 确保是该团队的题目
      },
      include: {
        testCases: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 检查访问权限
    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      return NextResponse.json(
        { success: false, error: '团队不存在' },
        { status: 404 }
      )
    }

    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })

    if (!team.isPublic && !member) {
      return NextResponse.json(
        { success: false, error: '无权访问该团队' },
        { status: 403 }
      )
    }

    // 计算统计信息
    // 这里的 AC 率是基于该题目在所有地方的提交？
    // 既然是团队私有题目，提交也是针对这个 ID 的。
    // Problem 模型有 totalSubmit 和 totalAccepted
    const acRate = problem.totalSubmit > 0 
      ? Math.round((problem.totalAccepted / problem.totalSubmit) * 100) 
      : 0

    return NextResponse.json({
      success: true,
      data: {
        id: problem.id,
        title: problem.title,
        description: problem.description,
        difficulty: problem.difficulty,
        tags: problem.tags || [],
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        testCases: problem.testCases.map(tc => ({
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.output,
          isHidden: !tc.isSample
        })),
        stats: {
          acCount: problem.totalAccepted,
          totalSubmissions: problem.totalSubmit,
          acRate
        },
        createdBy: problem.authorId,
        createdAt: problem.createdAt,
        updatedAt: problem.updatedAt
      }
    })
  } catch (error: any) {
    console.error('获取团队题目详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取团队题目详情失败' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/teams/[id]/problems/[problemId] - 更新团队题目
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id, problemId } = await context.params
    const teamId = id

    if (!isValidObjectId(teamId) || !isValidObjectId(problemId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查权限（只有管理员可以编辑题目）
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以编辑题目' },
        { status: 403 }
      )
    }

    // 检查题目是否存在
    const problem = await prisma.problem.findUnique({
      where: {
        id: problemId,
        teamId: teamId
      }
    })

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { title, description, difficulty, tags, timeLimit, memoryLimit } = body

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (difficulty !== undefined) updateData.difficulty = difficulty
    if (tags !== undefined) updateData.tags = tags
    if (timeLimit !== undefined) updateData.timeLimit = timeLimit
    if (memoryLimit !== undefined) updateData.memoryLimit = memoryLimit

    await prisma.problem.update({
      where: { id: problemId },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      message: '题目更新成功'
    })
  } catch (error: any) {
    console.error('更新团队题目失败:', error)
    return NextResponse.json(
      { success: false, error: '更新团队题目失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/teams/[id]/problems/[problemId] - 删除团队题目
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id, problemId } = await context.params
    const teamId = id

    if (!isValidObjectId(teamId) || !isValidObjectId(problemId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查权限（只有管理员可以删除题目）
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以删除题目' },
        { status: 403 }
      )
    }

    // 检查题目是否存在
    const problem = await prisma.problem.findUnique({
      where: {
        id: problemId,
        teamId: teamId
      }
    })

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 删除题目（testCases 会自动级联删除）
    await prisma.problem.delete({
      where: { id: problemId }
    })

    return NextResponse.json({
      success: true,
      message: '题目删除成功'
    })
  } catch (error: any) {
    console.error('删除团队题目失败:', error)
    return NextResponse.json(
      { success: false, error: '删除团队题目失败' },
      { status: 500 }
    )
  }
}
