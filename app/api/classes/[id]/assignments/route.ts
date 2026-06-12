/**
 * 班级作业管理 API
 * - GET /api/classes/[id]/assignments - 获取班级作业列表
 * - POST /api/classes/[id]/assignments - 创建班级作业（使用平台公开题库）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { Prisma } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/classes/[id]/assignments - 获取班级作业列表
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

    const { id } = await context.params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({ where: { id } })
    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 检查是否为班级成员
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: user.userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有班级成员可以查看作业' },
        { status: 403 }
      )
    }

    // 获取 URL 参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const status = searchParams.get('status') // ongoing, ended

    // 构建查询条件
    const where: Prisma.ClassAssignmentWhereInput = { classId: id }

    const now = new Date()
    if (status === 'ongoing') {
      where.endTime = { gte: now }
    } else if (status === 'ended') {
      where.endTime = { lt: now }
    }

    // 获取作业列表
    const [assignments, total] = await Promise.all([
      prisma.classAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.classAssignment.count({ where })
    ])

    // 获取每个作业的完成情况
    const creatorIds = [...new Set(assignments.map(a => a.createdBy).filter(Boolean))]
    const creatorMap = new Map<string, string>()
    if (creatorIds.length > 0) {
      const creators = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, nickname: true, username: true } })
      creators.forEach(u => creatorMap.set(u.id, u.nickname || u.username))
    }

    const assignmentsWithStats = await Promise.all(
      assignments.map(async (assignment) => {
        // 获取作业的所有提交
        const submissions = await prisma.classAssignmentSubmission.findMany({
          where: { assignmentId: assignment.id }
        })

        const memberCount = await prisma.classMember.count({ where: { classId: id } })

        const problemIds = assignment.problemIds || []
        const problemCount = problemIds.length
        
        // 计算完成率
        // 统计每个成员在每个题目上的最高分
        const memberProblemScores = new Map<string, Map<string, number>>()
        
        submissions.forEach(sub => {
          const userKey = sub.userId
          const problemKey = sub.problemId
          
          if (!memberProblemScores.has(userKey)) {
            memberProblemScores.set(userKey, new Map())
          }
          
          const userScores = memberProblemScores.get(userKey)!
          const currentScore = userScores.get(problemKey) || 0
          userScores.set(problemKey, Math.max(currentScore, sub.score || 0))
        })

        // 计算完成的题目数（得分100分的题目）
        let totalCompletedProblems = 0
        memberProblemScores.forEach(userScores => {
          userScores.forEach(score => {
            if (score === 100) totalCompletedProblems++
          })
        })

        // 完成率 = 完成题目数 / (成员数 × 题目数) × 100
        const totalProblems = memberCount * problemCount
        const completionRate = totalProblems > 0 
          ? Math.round((totalCompletedProblems / totalProblems) * 100)
          : 0

        // 检查当前用户是否已完成
        const userSubmissions = submissions.filter(
          s => s.userId === user.userId
        )
        
        // 简单判断用户状态：如果有提交就是 'Started'，如果所有题目都AC就是 'Completed'，否则 'Not Started'
        // 这里只是简单实现，实际逻辑可能更复杂
        let userStatus = 'Not Started'
        if (userSubmissions.length > 0) {
            userStatus = 'Started'
            // 检查是否所有题目都AC
            const userProblemScores = memberProblemScores.get(user.userId)
            if (userProblemScores && userProblemScores.size === problemCount) {
                let allAc = true
                for (const pid of problemIds) {
                    if ((userProblemScores.get(pid) || 0) < 100) {
                        allAc = false
                        break
                    }
                }
                if (allAc && problemCount > 0) userStatus = 'Completed'
            }
        }

        return {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          deadline: assignment.endTime, // 兼容旧字段
          problemCount,
          stats: {
            totalMembers: memberCount,
            completedMembers: totalCompletedProblems,
            completionRate
          },
          userStatus,
          createdAt: assignment.createdAt,
          createdBy: assignment.createdBy,
          createdByName: creatorMap.get(assignment.createdBy || '') || assignment.createdBy || '-'
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        assignments: assignmentsWithStats,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    })
  } catch (error: any) {
    console.error('获取班级作业列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取班级作业列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/classes/[id]/assignments - 创建班级作业
 * Body:
 * - title: string
 * - description?: string
 * - deadline: Date
 * - problemIds: string[] (平台公开题库的题目ID列表)
 */
export async function POST(
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

    const { id } = await context.params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    const { title, description, startTime, endTime, deadline, problemIds } = body
    
    // 验证必填字段（兼容 deadline 和 endTime）
    const finalEndTime = endTime || deadline
    if (!title || !finalEndTime || !problemIds || problemIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请填写完整的作业信息' },
        { status: 400 }
      )
    }

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({ where: { id } })
    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 检查权限（只有管理员可以创建作业）
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId: id,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'assistant')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以创建作业' },
        { status: 403 }
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

    // 创建作业
    const now = new Date()
    const finalStartTime = startTime ? new Date(startTime) : now
    const finalDeadlineDate = new Date(finalEndTime)
    
    // 使用 create，在 MongoDB Standalone 上通常是安全的，除非有嵌套写入
    const assignment = await prisma.classAssignment.create({
      data: {
        classId: id,
        title,
        description: description || '',
        startTime: finalStartTime,
        endTime: finalDeadlineDate,
        problemIds: problemIds,
        createdBy: user.userId,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: assignment.id
      },
      message: '作业创建成功'
    })
  } catch (error: any) {
    console.error('创建班级作业失败:', error)
    return NextResponse.json(
      { success: false, error: '创建班级作业失败' },
      { status: 500 }
    )
  }
}
