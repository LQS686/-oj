import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/submissions/[id] - 获取提交详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { id } = resolvedParams

    // 先尝试从 Submission 模型中查找
    let submission: any = await prisma.submission.findUnique({
      where: { id },
      include: {
        problem: {
          select: {
            id: true,
            problemNumber: true,
            title: true,
            difficulty: true,
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
    })

    // 如果在 Submission 中找不到，尝试从 TeamAssignmentSubmission 中查找
    if (!submission) {
      const teamSubmission = await prisma.teamAssignmentSubmission.findUnique({
        where: { id }
      })
      
      if (teamSubmission) {
        // 获取相关的题目和用户信息
        const [problem, user] = await Promise.all([
          prisma.problem.findUnique({
            where: { id: teamSubmission.problemId },
            select: {
              id: true,
              problemNumber: true,
              title: true,
              difficulty: true
            }
          }),
          prisma.user.findUnique({
            where: { id: teamSubmission.userId },
            select: {
              id: true,
              username: true,
              nickname: true
            }
          })
        ])
        
        // 格式化团队作业提交记录
        submission = {
          id: teamSubmission.id,
          problemId: teamSubmission.problemId,
          userId: teamSubmission.userId,
          language: teamSubmission.language,
          code: teamSubmission.code,
          status: teamSubmission.status,
          score: teamSubmission.score,
          time: teamSubmission.time,
          memory: teamSubmission.memory,
          passedTests: teamSubmission.passedTests,
          totalTests: teamSubmission.totalTests,
          message: teamSubmission.message,
          submittedAt: teamSubmission.submittedAt,
          problem: problem || {
            id: teamSubmission.problemId,
            problemNumber: null,
            title: '未知题目',
            difficulty: '未知'
          },
          user: user || {
            id: teamSubmission.userId,
            username: '未知用户',
            nickname: null
          }
        }
      }
    }

    if (!submission) {
      return NextResponse.json(
        { success: false, error: '提交记录不存在' },
        { status: 404 }
      )
    }

    // 格式化测试结果
    // 注意：Prisma 模型中 testResults 可能是 Json 类型，如果是 Submission 模型
    // TeamAssignmentSubmission 没有 testResults 字段（根据之前的 schema）
    // Submission 模型我们在 schema 中添加了 testResults Json?
    
    let testResults = []
    if ('testResults' in submission && submission.testResults) {
        testResults = submission.testResults as any
    }

    return NextResponse.json({
      success: true,
      data: {
        ...submission,
        testResults,
      },
    })
  } catch (error) {
    console.error('获取提交详情错误:', error)
    return NextResponse.json(
      { success: false, error: '获取提交详情失败' },
      { status: 500 }
    )
  }
}
