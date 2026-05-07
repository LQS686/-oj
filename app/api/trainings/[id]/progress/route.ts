import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { success, notFound, unauthorized, error } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const training = await prisma.training.findUnique({
      where: { id },
      include: {
        problems: {
          select: { problemId: true },
        },
      },
    })

    if (!training) {
      return notFound('训练计划不存在')
    }

    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return unauthorized('请先登录')
    }

    const problemIds = training.problems.map(p => p.problemId)
    const totalProblems = problemIds.length

    const submissions = await prisma.submission.findMany({
      where: {
        userId: currentUser.userId,
        problemId: { in: problemIds },
      },
      select: {
        problemId: true,
        status: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: 'desc' },
    })

    const problemStatusMap = new Map<string, { status: string; submittedAt: Date }>()
    for (const sub of submissions) {
      if (!problemStatusMap.has(sub.problemId)) {
        problemStatusMap.set(sub.problemId, { status: sub.status, submittedAt: sub.submittedAt })
      }
    }

    let solvedCount = 0
    let attemptedCount = 0
    const problemProgress: Array<{ problemId: string; status: string; submittedAt: Date | null }> = []

    for (const problemId of problemIds) {
      const statusData = problemStatusMap.get(problemId)
      if (statusData) {
        attemptedCount++
        if (statusData.status === 'AC') {
          solvedCount++
          problemProgress.push({ problemId, status: 'AC', submittedAt: statusData.submittedAt })
        } else {
          problemProgress.push({ problemId, status: statusData.status, submittedAt: statusData.submittedAt })
        }
      } else {
        problemProgress.push({ problemId, status: 'NOT_STARTED', submittedAt: null })
      }
    }

    const progressPercentage = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0

    const recentSubmissions = await prisma.submission.findMany({
      where: {
        userId: currentUser.userId,
        problemId: { in: problemIds },
      },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        problemId: true,
        status: true,
        language: true,
        submittedAt: true,
      },
    })

    return success({
      training: {
        id: training.id,
        title: training.title,
      },
      progress: {
        totalProblems,
        solvedCount,
        attemptedCount,
        progressPercentage,
      },
      problemProgress,
      recentSubmissions: recentSubmissions.map(s => ({
        id: s.id,
        problemId: s.problemId,
        status: s.status,
        language: s.language,
        submittedAt: s.submittedAt,
      })),
    })
  } catch (err) {
    logger.error('获取训练进度错误', err)
    return error('获取训练进度失败', 500)
  }
}
