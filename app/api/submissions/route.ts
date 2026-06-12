import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addJudgeJob } from '@/lib/judge/queue'
import { createSubmissionDirect, incrementProblemSubmitCount, updateSubmissionDirect } from '@/lib/mongodb-direct'
import type { Prisma } from '@prisma/client'

interface TestCaseForJudge {
  id: string
  input: string
  output: string
  score: number
  timeLimit?: number
  memoryLimit?: number
}
import { logger } from '@/lib/logger'

// POST /api/submissions - 提交代码
export async function POST(request: NextRequest) {
  try {
    // 验证用户登录
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // 验证必需字段
    if (!body.problemId || !body.code || !body.language) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必需字段: problemId, code, language',
        },
        { status: 400 }
      )
    }

    // 验证题目是否存在（支持题目编号如 P1001 或 ObjectID）
    let problem
    try {
      // 尝试通过 problemNumber 查找
      problem = await prisma.problem.findUnique({
        where: { problemNumber: body.problemId },
        include: { testCases: true },
      })
      
      // 如果没找到，尝试通过 ObjectID 查找
      if (!problem && body.problemId.length === 24) {
        problem = await prisma.problem.findUnique({
          where: { id: body.problemId },
          include: { testCases: true },
        })
      }
    } catch (error) {
      logger.error('查找题目错误', error)
    }

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 创建提交记录 (使用直接 MongoDB 操作绕过 Prisma 事务限制)
    const submission = await createSubmissionDirect({
      problemId: problem.id,
      userId: currentUser.userId,
      contestId: body.contestId || undefined,
      language: body.language,
      code: body.code,
      status: 'Pending',
      totalTests: problem.testCases.length,
    })

    // 更新题目提交数
    await incrementProblemSubmitCount(problem.id)

    // ❌ 【数据隔离】题库提交不应该同步到作业
    // 只有从作业路径提交的代码才应该记录到 ClassAssignmentSubmission
    // 作业提交请使用: POST /api/classes/{id}/assignments/{assignmentId}/submit
    logger.info('题库提交，不同步到作业')

    // 加入评测队列
    try {
      await addJudgeJob({
        submissionId: submission.id,
        problemId: problem.id,
        userId: currentUser.userId,
        code: body.code,
        language: body.language,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        testCases: problem.testCases.map((tc): TestCaseForJudge => ({
          id: tc.id,
          input: tc.input,
          output: tc.output,
          score: tc.score,
        })),
      })
      
      logger.info(`提交 ${submission.id} 已加入评测队列`)
    } catch (queueError) {
      logger.error('加入队列失败', queueError)
      // 依然返回成功，但标记为系统错误
      await updateSubmissionDirect(submission.id, {
        status: 'SE',
        message: '评测系统错误，请稍后重试'
      })
    }

    return NextResponse.json(
      {
        success: true,
        submissionId: submission.id,  // 返回 submissionId 用于实时跟踪
        data: submission,
        message: '代码已提交，正在评测中...',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('提交代码错误', error)
    return NextResponse.json(
      {
        success: false,
        error: '提交失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}

// GET /api/submissions - 获取提交记录列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50
    
    const problemId = searchParams.get('problemId')
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    const where: Prisma.SubmissionWhereInput = {}
    if (problemId) where.problemId = problemId
    if (userId) where.userId = userId
    if (status) where.status = status

    // 使用 Promise.allSettled 以避免查询失败
    const [submissionsResult, totalResult] = await Promise.allSettled([
      prisma.submission.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      }),
      prisma.submission.count({ where }),
    ])

    // 检查查询是否成功
    if (submissionsResult.status === 'rejected') {
      logger.error('查询提交记录失败', submissionsResult.reason)
      throw submissionsResult.reason
    }
    
    if (totalResult.status === 'rejected') {
      logger.error('查询提交总数失败', totalResult.reason)
      throw totalResult.reason
    }

    const submissions = submissionsResult.value
    const total = totalResult.value

    // 过滤掉 problem 为 null 的记录（题目已被删除）
    const validSubmissions = submissions.filter(sub => sub.problem !== null)

    // 如果有无效记录，记录警告日志
    if (validSubmissions.length < submissions.length) {
      logger.warn(`发现 ${submissions.length - validSubmissions.length} 条无效提交记录（对应题目不存在）`)
    }

    return NextResponse.json({
      success: true,
      data: {
        submissions: validSubmissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    logger.error('获取提交记录错误', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取提交记录失败',
      },
      { status: 500 }
    )
  }
}
