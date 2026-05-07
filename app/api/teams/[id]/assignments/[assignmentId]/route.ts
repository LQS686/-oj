/**
 * 团队单个作业管理 API
 * - GET /api/teams/[id]/assignments/[assignmentId] - 获取作业详情
 * - PUT /api/teams/[id]/assignments/[assignmentId] - 更新作业
 * - DELETE /api/teams/[id]/assignments/[assignmentId] - 删除作业
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { updateTeamAssignmentDirect, deleteTeamAssignmentDirect } from '@/lib/mongodb-direct'

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/teams/[id]/assignments/[assignmentId] - 获取作业详情
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

    const { id, assignmentId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(assignmentId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查是否为团队成员
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有团队成员可以查看作业' },
        { status: 403 }
      )
    }

    // 获取作业详情
    const assignment = await prisma.teamAssignment.findUnique({
      where: {
        id: assignmentId,
        teamId: id
      }
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // 获取题目详情（从平台公开题库）
    const problems = await prisma.problem.findMany({
      where: {
        id: { in: assignment.problemIds }
      },
      select: {
        id: true,
        title: true,
        problemNumber: true,
        difficulty: true,
        tags: true,
        totalSubmit: true,
        totalAccepted: true
      }
    })

    // 获取所有成员的完成情况
    const [members, submissions] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId: id },
        include: {
          user: {
            select: {
              username: true,
              nickname: true,
              avatar: true
            }
          }
        }
      }),
      prisma.teamAssignmentSubmission.findMany({
        where: { assignmentId: assignmentId }
      })
    ])

    // 构建成员完成情况
    const memberProgress = members.map((member) => {
      const userSubmissions = submissions.filter(
        s => s.userId === member.userId
      )

      // 如果该用户没有任何提交，返回 null
      if (userSubmissions.length === 0) {
        return null
      }

      const solvedProblems = new Set(
        userSubmissions
          .filter(s => s.status === 'AC')
          .map(s => s.problemId)
      )

      return {
        userId: member.userId,
        username: member.user.username,
        nickname: member.user.nickname,
        avatar: member.user.avatar,
        role: member.role, // 添加 role 方便前端显示
        progress: {
          solved: solvedProblems.size,
          total: assignment.problemIds.length,
          percentage: assignment.problemIds.length > 0 
            ? Math.round((solvedProblems.size / assignment.problemIds.length) * 100)
            : 0
        }
      }
    }).filter(Boolean) // 过滤掉 null 值

    // 获取当前用户的提交记录
    const userSubmissions = submissions.filter(
      s => s.userId === user.userId
    )

    const isAdminOrOwner = member.role === 'owner' || member.role === 'admin'

    let allSubmissions: any[] = []
    if (isAdminOrOwner) {
      allSubmissions = submissions.map(s => ({
        id: s.id,
        userId: s.userId,
        problemId: s.problemId,
        status: s.status,
        score: s.score || 0,
        submittedAt: s.submittedAt
      }))
    }

    const problemStats = assignment.problemIds.reduce((acc: Record<string, { submitCount: number; acceptedCount: number; acceptedUsers: Set<string> }>, problemId) => {
      const problemSubs = submissions.filter(s => s.problemId === problemId)
      const acceptedUsers = new Set(
        problemSubs.filter(s => s.status === 'AC').map(s => s.userId)
      )
      acc[problemId] = {
        submitCount: problemSubs.length,
        acceptedCount: acceptedUsers.size,
        acceptedUsers
      }
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      data: {
        assignment: {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          deadline: assignment.endTime,
          problems: problems.map(p => ({
            id: p.id,
            title: p.title,
            problemNumber: p.problemNumber || '',
            difficulty: p.difficulty,
            totalSubmit: problemStats[p.id]?.submitCount || 0,
            totalAccepted: problemStats[p.id]?.acceptedCount || 0
          })),
          teamId: assignment.teamId,
          memberProgress: memberProgress.sort((a: any, b: any) => b.progress.solved - a.progress.solved),
          createdAt: assignment.createdAt,
          createdBy: assignment.createdBy
        },
        submissions: userSubmissions.map(s => ({
          id: s.id,
          problemId: s.problemId,
          status: s.status,
          score: s.score || 0,
          submittedAt: s.submittedAt
        })),
        allSubmissions
      }
    })
  } catch (error: any) {
    console.error('获取作业详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取作业详情失败' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/teams/[id]/assignments/[assignmentId] - 更新作业
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

    const { id, assignmentId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(assignmentId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { title, description, startTime, endTime, deadline, problemIds } = body

    // 验证必填字段
    const finalEndTime = endTime || deadline
    if (!title || !problemIds || problemIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请填写完整的作业信息' },
        { status: 400 }
      )
    }

    // 检查权限（只有管理员可以更新作业）
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以更新作业' },
        { status: 403 }
      )
    }

    // 检查作业是否存在
    const existingAssignment = await prisma.teamAssignment.findUnique({
      where: {
        id: assignmentId,
        teamId: id
      }
    })

    if (!existingAssignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // 验证题目是否存在于平台公开题库中
    const problems = await prisma.problem.findMany({
      where: {
        id: { in: problemIds },
        isPublic: true
      }
    })

    if (problems.length !== problemIds.length) {
      return NextResponse.json(
        { success: false, error: '部分题目不存在或未公开' },
        { status: 400 }
      )
    }

    // 更新作业 (使用 MongoDB Direct 避免事务错误)
    const finalStartTime = startTime ? new Date(startTime) : (existingAssignment.startTime || undefined)
    const finalDeadlineDate = finalEndTime ? new Date(finalEndTime) : (existingAssignment.endTime || undefined)

    await updateTeamAssignmentDirect(assignmentId, {
      title,
      description: description || '',
      startTime: finalStartTime,
      endTime: finalDeadlineDate,
      problemIds: problemIds,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: assignmentId
      },
      message: '作业更新成功'
    })
  } catch (error: any) {
    console.error('更新作业失败:', error)
    return NextResponse.json(
      { success: false, error: '更新作业失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/teams/[id]/assignments/[assignmentId] - 删除作业
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

    const { id, assignmentId } = await context.params
    
    if (!isValidObjectId(id) || !isValidObjectId(assignmentId)) {
      return NextResponse.json(
        { success: false, error: '无效的ID' },
        { status: 400 }
      )
    }

    // 检查权限
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以删除作业' },
        { status: 403 }
      )
    }

    // 检查作业是否存在
    const assignment = await prisma.teamAssignment.findUnique({
      where: {
        id: assignmentId,
        teamId: id
      }
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // 删除作业（使用 MongoDB Direct 避免事务错误）
    await deleteTeamAssignmentDirect(assignmentId)

    return NextResponse.json({
      success: true,
      message: '作业删除成功'
    })
  } catch (error: any) {
    console.error('删除作业失败:', error)
    return NextResponse.json(
      { success: false, error: '删除作业失败' },
      { status: 500 }
    )
  }
}
