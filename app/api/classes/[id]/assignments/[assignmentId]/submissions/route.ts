/**
 * 获取作业提交记录
 * GET /api/classes/[id]/assignments/[assignmentId]/submissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>
}

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
    const classId = id
    const userId = user.userId

    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const problemId = searchParams.get('problemId')  // 可选：筛选特定题目
    const userIdParam = searchParams.get('userId')  // 可选：查看其他用户的提交
    const statusParam = searchParams.get('status')  // 可选：筛选状态
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const limit = parseInt(searchParams.get('limit') || pageSize.toString())

    // 检查是否为班级成员
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有班级成员可以查看提交记录' },
        { status: 403 }
      )
    }

    // ✅ 权限检查：如果查看的不是自己的提交记录，需要是管理员或班级创建人/管理员
    if (userIdParam && userIdParam !== userId) {
      console.log(`[权限检查] 开始检查 - 当前用户: ${userId}, 目标用户: ${userIdParam}, 题目ID: ${problemId || '无'}`)
      
      // 检查是否为系统管理员
      const currentUser = await prisma.user.findUnique({ where: { id: userId } })
      const isSystemAdmin = currentUser?.isAdmin === true
      
      // 检查是否为班级创建人或管理员
      const isClassTeacher = member.role === 'owner'
      const isClassAssistant = member.role === 'assistant'
      
      // ✅ 检查是否完成了当前题目并获得满分
      let hasFullScore = false
      if (problemId) {
        console.log(`[权限检查] 开始查询用户 ${userId} 在题目 ${problemId} 上的提交记录`)
        
        // 查询当前用户在该题目上的最高分
        const userSubmissions = await prisma.classAssignmentSubmission.findMany({
          where: {
            assignmentId,
            userId,
            problemId
          },
          select: { score: true }
        })
        
        console.log(`[权限检查] 找到 ${userSubmissions.length} 条提交记录`)
        
        if (userSubmissions.length > 0) {
          const scores = userSubmissions.map(s => s.score || 0)
          const maxScore = Math.max(...scores)
          hasFullScore = maxScore === 100
          console.log(`[权限检查] 用户 ${userId} 在题目 ${problemId} 上的所有分数: [${scores.join(', ')}], 最高分: ${maxScore}, 是否满分: ${hasFullScore}`)
        } else {
          console.log(`[权限检查] 用户 ${userId} 在题目 ${problemId} 上没有提交记录`)
        }
      } else {
        console.log(`[权限检查] 未指定 problemId，跳过满分检查`)
      }
      
      console.log(`[权限检查] 权限状态 - 系统管理员: ${isSystemAdmin}, 班级创建人: ${isClassTeacher}, 班级管理员: ${isClassAssistant}, 获得满分: ${hasFullScore}`)
      
      if (!isSystemAdmin && !isClassTeacher && !isClassAssistant && !hasFullScore) {
        console.log(`[权限检查] 权限验证失败，拒绝访问`)
        return NextResponse.json(
          { success: false, error: '只有系统管理员、班级创建人、班级管理员或完成该题目并获得满分的用户可以查看他人的提交记录' },
          { status: 403 }
        )
      }
      
      console.log(`[权限检查] 权限验证成功，允许访问`)
    }

    // 检查作业是否存在
    const assignment = await prisma.classAssignment.findUnique({
      where: {
        id: assignmentId,
        classId
      }
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // ✅ 【数据隔离】获取当前用户在当前作业中的提交记录
    const where: any = {
      assignmentId,
    }
    
    if (userIdParam) {
      where.userId = userIdParam
    } else {
      where.userId = userId
    }
    
    if (problemId) {
      where.problemId = problemId
    }
    
    if (statusParam) {
      where.status = statusParam
    }
    
    // 获取总数
    const total = await prisma.classAssignmentSubmission.count({ where })
    
    // 分页查询
    const submissions = await prisma.classAssignmentSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })

    console.log(`[DataIsolation] 作业提交记录查询 - 作业ID: ${assignmentId}, 用户ID: ${userIdParam || userId}, 题目ID: ${problemId || '全部'}, 状态: ${statusParam || '全部'}, 记录数: ${submissions.length}/${total}`)

    // 批量获取相关信息
    const userIds = [...new Set(submissions.map(s => s.userId))]
    const problemIds = [...new Set(submissions.map(s => s.problemId))]

    const [users, problems] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true }
      }),
      prisma.problem.findMany({
        where: { id: { in: problemIds } },
        select: { id: true, title: true, problemNumber: true }
      })
    ])

    const userMap = new Map(users.map(u => [u.id, u]))
    const problemMap = new Map(problems.map(p => [p.id, p]))

    // 格式化提交记录
    const formattedSubmissions = submissions.map(sub => {
      const userInfo = userMap.get(sub.userId)
      const problemInfo = problemMap.get(sub.problemId)
      
      return {
        id: sub.id,
        problem: {
          id: sub.problemId,
          title: problemInfo?.title || 'Unknown Problem',
          problemNumber: problemInfo?.problemNumber
        },
        userId: sub.userId,
        user: {
          id: sub.userId,
          username: userInfo?.username,
          nickname: userInfo?.nickname
        },
        language: sub.language,
        code: sub.code,
        status: sub.status,
        score: sub.score || 0,
        time: sub.time || 0,
        memory: sub.memory || 0,
        passedTests: sub.passedTests,
        totalTests: sub.totalTests,
        message: sub.message,
        submittedAt: sub.submittedAt,
        isLate: sub.isLate
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        submissions: formattedSubmissions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          pageSize: limit,
          total: total
        }
      }
    })
  } catch (error: any) {
    console.error('获取作业提交记录失败:', error)
    return NextResponse.json(
      { success: false, error: '获取提交记录失败' },
      { status: 500 }
    )
  }
}
