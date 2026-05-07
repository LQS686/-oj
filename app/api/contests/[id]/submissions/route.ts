import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { addJudgeJob } from '@/lib/judge/queue'
import { createSubmissionDirect, incrementProblemSubmitCount, updateSubmissionDirect } from '@/lib/mongodb-direct'

// POST /api/contests/[id]/submissions - 提交竞赛代码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contestId } = await params
    
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

    // 1. 获取竞赛信息并验证状态
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    })

    if (!contest) {
      return NextResponse.json(
        { success: false, error: '竞赛不存在' },
        { status: 404 }
      )
    }

    const now = new Date()
    
    // 管理员可以随时提交（用于测试），普通用户需在比赛期间提交
    if (!currentUser.isAdmin) {
      if (now < contest.startTime) {
        return NextResponse.json(
          { success: false, error: '竞赛尚未开始' },
          { status: 403 }
        )
      }
      
      if (now > contest.endTime) {
        return NextResponse.json(
          { success: false, error: '竞赛已结束' },
          { status: 403 }
        )
      }

      // 2. 验证用户是否报名
      const participant = await prisma.contestParticipant.findFirst({
        where: {
          contestId: contestId,
          userId: currentUser.userId
        }
      })

      if (!participant) {
        return NextResponse.json(
          { success: false, error: '未报名该竞赛，无法提交' },
          { status: 403 }
        )
      }
    }

    // 3. 验证题目是否属于该竞赛
    // body.problemId 可能是真实 problemId，也可能是 contestProblem 的 id 或者 orderIndex
    // 假设前端传的是真实 problemId
    const contestProblem = await prisma.contestProblem.findFirst({
      where: {
        contestId: contestId,
        problemId: body.problemId
      },
      include: {
        problem: {
          include: { testCases: true }
        }
      }
    })

    if (!contestProblem) {
      return NextResponse.json(
        { success: false, error: '该题目不属于当前竞赛' },
        { status: 400 }
      )
    }

    const problem = contestProblem.problem

    // 4. 创建提交记录
    const submission = await createSubmissionDirect({
      problemId: problem.id,
      userId: currentUser.userId,
      contestId: contestId,
      language: body.language,
      code: body.code,
      status: 'Pending',
      totalTests: problem.testCases.length,
    })

    // 更新题目总提交数
    await incrementProblemSubmitCount(problem.id)

    // 5. 加入评测队列
    try {
      await addJudgeJob({
        submissionId: submission.id,
        problemId: problem.id,
        userId: currentUser.userId,
        code: body.code,
        language: body.language,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        testCases: problem.testCases.map((tc: any) => ({
          id: tc.id,
          input: tc.input,
          output: tc.output,
          score: tc.score,
          timeLimit: tc.timeLimit,
          memoryLimit: tc.memoryLimit,
        })),
      })
      
      console.log(`✅ 竞赛提交 ${submission.id} 已加入评测队列`)
    } catch (queueError) {
      console.error('加入队列失败:', queueError)
      // 依然返回成功，但标记为系统错误
      await updateSubmissionDirect(submission.id, {
        status: 'SE',
        message: '评测系统错误，请稍后重试'
      })
    }

    return NextResponse.json(
      {
        success: true,
        submissionId: submission.id,
        data: submission,
        message: '代码已提交，正在评测中...',
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('竞赛提交失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '提交失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}

// GET /api/contests/[id]/submissions - 获取竞赛提交列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contestId } = await params
    
    // 验证访问权限
    const currentUser = getUserFromRequest(request)
    // 动态导入 checkContestAccess 以避免循环依赖（虽然这里应该没有）
    const { checkContestAccess } = await import('@/lib/contest-auth')
    const access = await checkContestAccess(contestId, currentUser, request)
    
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const userId = searchParams.get('userId')
    const problemId = searchParams.get('problemId')
    
    const where: any = {
      contestId: contestId
    }
    
    if (userId) where.userId = userId
    if (problemId) where.problemId = problemId

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true
            }
          },
          problem: {
            select: {
              id: true,
              title: true,
              problemNumber: true
            }
          }
        }
      }),
      prisma.submission.count({ where })
    ])

    return NextResponse.json({
      success: true,
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    })

  } catch (error) {
    console.error('获取竞赛提交列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取数据失败' },
      { status: 500 }
    )
  }
}
