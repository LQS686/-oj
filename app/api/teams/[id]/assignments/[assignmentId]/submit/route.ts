/**
 * 作业题目代码提交API
 * POST /api/teams/[id]/assignments/[assignmentId]/submit
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addJudgeJob } from '@/lib/judge/queue'
import { 
  createSubmissionDirect, 
  createTeamAssignmentSubmissionDirect, 
  incrementProblemSubmitCount,
  updateSubmissionDirect,
  updateTeamAssignmentSubmissionDirect
} from '@/lib/mongodb-direct'

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>
}

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

    const { id, assignmentId } = await context.params
    
    // 验证 ID 格式 (MongoDB ObjectId)
    const objectIdRegex = /^[0-9a-fA-F]{24}$/
    if (!objectIdRegex.test(id) || !objectIdRegex.test(assignmentId)) {
      return NextResponse.json(
        { success: false, error: '无效的 ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { problemId, code, language } = body

    // 验证必填字段
    if (!problemId || !code || !language) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      )
    }

    if (code.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: '代码长度不能少于10个字符' },
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
        { success: false, error: '只有团队成员可以提交代码' },
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

    // 检查题目是否在作业中
    const isProblemInAssignment = assignment.problemIds.includes(problemId)

    if (!isProblemInAssignment) {
      return NextResponse.json(
        { success: false, error: '该题目不在当前作业中' },
        { status: 400 }
      )
    }

    // 检查题目是否存在并获取测试用例
    // 注意：Prisma 中 problemId 应该是 String (ObjectId)
    let problem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: { testCases: { orderBy: { orderIndex: 'asc' } } }
    })
    
    // 兼容性：如果传的是 problemNumber (虽然 assignment.problemIds 存的是 ObjectId，但前端可能传错)
    // 但 assignment.problemIds 存的是 ObjectId，所以这里应该就是 ObjectId
    
    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 检查题目是否有测试用例
    if (!problem.testCases || problem.testCases.length === 0) {
      return NextResponse.json(
        { success: false, error: '题目没有测试用例，无法评测' },
        { status: 400 }
      )
    }

    // 检查是否逾期
    const deadline = assignment.endTime ? new Date(assignment.endTime) : null
    const now = new Date()
    const isLate = deadline ? now > deadline : false
    
    console.log(`[Debug] 逾期检查 - deadline: ${deadline ? deadline.toISOString() : 'None'}, now: ${now.toISOString()}, isLate: ${isLate}`)

    // ✅ 【数据隔离】创建作业专用的提交记录
    // 使用直接 MongoDB 操作绕过 Prisma 事务限制
    const assignmentSubmission = await createTeamAssignmentSubmissionDirect({
      assignmentId: assignmentId,
      userId: user.userId,
      problemId: problemId,
      code: code,
      language: language,
      status: 'Pending',
      totalTests: problem.testCases.length,
      isLate: isLate
    })

    const assignmentSubmissionId = assignmentSubmission.id

    console.log(`[DataIsolation] 作业提交记录已创建 - 作业ID: ${assignmentId}, 提交ID: ${assignmentSubmissionId}, 逾期: ${isLate}`)

    // ✅ 同时创建 Submission 记录用于评测
    // 关联作业提交记录ID
    const submission = await createSubmissionDirect({
      problemId: problemId,
      userId: user.userId,
      code: code,
      language: language,
      status: 'Pending',
      totalTests: problem.testCases.length,
      assignmentSubmissionId: assignmentSubmissionId
    })

    console.log(`[DataIsolation] 评测提交记录已创建 - 提交ID: ${submission.id}`)

    // 更新题目提交数
    await incrementProblemSubmitCount(problemId)

    // ✅ 加入评测队列
    try {
      await addJudgeJob({
        submissionId: submission.id,
        problemId: problemId,
        userId: user.userId,
        code: code,
        language: language,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        testCases: problem.testCases.map((tc) => ({
          id: tc.id,
          input: tc.input,
          output: tc.output,
          score: tc.score,
          timeLimit: problem!.timeLimit, // 使用题目统一的时间限制，或者 tc.timeLimit 如果有
          memoryLimit: problem!.memoryLimit,
        })),
      })

      console.log(`✅ 作业提交已加入评测队列: ${submission.id}`)
    } catch (queueError) {
      console.error('加入队列失败:', queueError)
      
      // 更新为系统错误
      await updateSubmissionDirect(submission.id, {
        status: 'SE',
        message: '评测系统错误，请稍后重试'
      })

      await updateTeamAssignmentSubmissionDirect(assignmentSubmissionId, {
        status: 'SE',
        message: '评测系统错误，请稍后重试'
      })
    }

    return NextResponse.json({
      success: true,
      submissionId: submission.id,  // 返回评测提交ID，用于WebSocket跟踪
      data: submission,
      message: isLate ? '代码已提交（逾期），正在评测中...' : '代码已提交，正在评测中...',
      isLate: isLate
    })
  } catch (error: any) {
    console.error('作业代码提交失败:', error)
    return NextResponse.json(
      { success: false, error: '提交失败' },
      { status: 500 }
    )
  }
}
