import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/problems/[id]/submissions - 获取题目的提交记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: problemIdOrNumber } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const userId = searchParams.get('userId') // 可选：只获取特定用户的提交

    console.log('📥 获取题目提交记录, 题目标识:', problemIdOrNumber, ', 页码:', page)

    // 先查找题目获取真实的 ObjectId
    let problem
    if (problemIdOrNumber.match(/^[0-9a-fA-F]{24}$/)) {
      // 是 ObjectId
      problem = await prisma.problem.findUnique({
        where: { id: problemIdOrNumber },
        select: { id: true }
      })
    } else {
      // 是 problemNumber
      problem = await prisma.problem.findFirst({
        where: { problemNumber: problemIdOrNumber },
        select: { id: true }
      })
    }

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    const problemId = problem.id

    // 构建查询条件
    const where: any = { problemId }
    if (userId) {
      where.userId = userId
    }

    // 查询 Submission 模型（题库和竞赛提交）- 不分页，获取所有数据后合并再分页
    const [submissions, teamSubmissions, totalSubmissions, totalTeamSubmissions] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          status: true,
          language: true,
          time: true,
          memory: true,
          score: true,
          passedTests: true,
          totalTests: true,
          submittedAt: true,
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      }),
      // 查询 TeamAssignmentSubmission 模型（团队作业提交）
      prisma.teamAssignmentSubmission.findMany({
        where: {
          problemId,
          ...(userId ? { userId } : {}),
        },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          status: true,
          language: true,
          time: true,
          memory: true,
          score: true,
          passedTests: true,
          totalTests: true,
          submittedAt: true,
          userId: true,
        },
      }),
      prisma.submission.count({ where }),
      prisma.teamAssignmentSubmission.count({
        where: {
          problemId,
          ...(userId ? { userId } : {}),
        },
      }),
    ])

    // 获取团队作业提交的用户信息
    const teamSubmissionUserIds = [...new Set(teamSubmissions.map(sub => sub.userId))]
    const users = teamSubmissionUserIds.length > 0 
      ? await prisma.user.findMany({
          where: { id: { in: teamSubmissionUserIds } },
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        })
      : []
    const userMap = new Map(users.map(user => [user.id, user]))

    // 格式化团队作业提交记录
    const formattedTeamSubmissions = teamSubmissions.map(sub => ({
      id: sub.id,
      status: sub.status,
      language: sub.language,
      time: sub.time,
      memory: sub.memory,
      score: sub.score,
      passedTests: sub.passedTests,
      totalTests: sub.totalTests,
      submittedAt: sub.submittedAt,
      user: userMap.get(sub.userId) || {
        id: sub.userId,
        username: '未知用户',
        nickname: null,
      },
    }))

    // 合并所有提交记录并按提交时间排序
    const allSubmissions = [...submissions, ...formattedTeamSubmissions]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice((page - 1) * limit, page * limit)

    const total = totalSubmissions + totalTeamSubmissions

    return NextResponse.json({
      success: true,
      data: {
        submissions: allSubmissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error('❌ 获取提交记录失败:', error)
    return NextResponse.json(
      { success: false, error: '获取提交记录失败' },
      { status: 500 }
    )
  }
}
