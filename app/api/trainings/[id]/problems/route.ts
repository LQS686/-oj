import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { success, notFound, error } from '@/lib/api-response'

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
      select: { id: true, title: true },
    })

    if (!training) {
      return notFound('训练计划不存在')
    }

    const trainingProblems = await prisma.trainingProblem.findMany({
      where: { trainingId: id },
      orderBy: { orderIndex: 'asc' },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            tags: true,
            totalSubmit: true,
            totalAccepted: true,
          },
        },
      },
    })

    const currentUser = getUserFromRequest(request)
    let problemStatuses: Record<string, { submitted: boolean; accepted: boolean }> = {}

    if (currentUser) {
      const problemIds = trainingProblems.map(p => p.problemId)
      const submissions = await prisma.submission.findMany({
        where: {
          userId: currentUser.userId,
          problemId: { in: problemIds },
        },
        select: {
          problemId: true,
          status: true,
        },
      })

      const problemStatusMap = new Map<string, { submitted: boolean; accepted: boolean }>()
      for (const sub of submissions) {
        const existing = problemStatusMap.get(sub.problemId) || { submitted: false, accepted: false }
        if (sub.status === 'AC') {
          problemStatusMap.set(sub.problemId, { submitted: true, accepted: true })
        } else if (!existing.submitted) {
          problemStatusMap.set(sub.problemId, { submitted: true, accepted: false })
        }
      }
      problemStatuses = Object.fromEntries(problemStatusMap)
    }

    const problems = trainingProblems.map(tp => ({
      ...tp.problem,
      orderIndex: tp.orderIndex,
      submitted: problemStatuses[tp.problemId]?.submitted ?? false,
      accepted: problemStatuses[tp.problemId]?.accepted ?? false,
    }))

    return success({
      training: {
        id: training.id,
        title: training.title,
      },
      problems,
    })
  } catch (err) {
    logger.error('获取训练计划题目列表错误', err)
    return error('获取训练计划题目列表失败', 500)
  }
}
