/**
 * GET /api/contests/[id]/problems - 获取竞赛题目列表
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const currentUser = getUserFromRequest(req)

  const access = await checkContestAccess(id!, currentUser, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId: id },
    orderBy: { orderIndex: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          problemNumber: true,
          difficulty: true,
          visibility: true,
          isPublic: true,
          totalAccepted: true,
          totalSubmit: true,
        },
      },
    },
  })

  const problemIds = contestProblems.map((cp) => cp.problemId)

  const userSubmissionStatus: Record<string, 'Accepted' | 'Attempted' | null> = {}
  const contestStats: Record<string, { accepted: number; submitted: number }> = {}

  if (currentUser) {
    const submissions = await prisma.submission.findMany({
      where: {
        contestId: id,
        problemId: { in: problemIds },
        userId: currentUser.userId,
      },
      select: {
        problemId: true,
        status: true,
      },
    })

    const problemSubmissionMap = new Map<string, Set<string>>()
    for (const sub of submissions) {
      if (!problemSubmissionMap.has(sub.problemId)) {
        problemSubmissionMap.set(sub.problemId, new Set())
      }
      problemSubmissionMap.get(sub.problemId)!.add(sub.status)
    }

    for (const problemId of problemIds) {
      const statuses = problemSubmissionMap.get(problemId)
      if (statuses?.has('Accepted')) {
        userSubmissionStatus[problemId] = 'Accepted'
      } else if (statuses && statuses.size > 0) {
        userSubmissionStatus[problemId] = 'Attempted'
      } else {
        userSubmissionStatus[problemId] = null
      }
    }
  }

  const contestSubmissions = await prisma.submission.groupBy({
    by: ['problemId'],
    where: {
      contestId: id,
      problemId: { in: problemIds },
    },
    _count: {
      _all: true,
    },
  })

  const acceptedSubmissions = await prisma.submission.groupBy({
    by: ['problemId'],
    where: {
      contestId: id,
      problemId: { in: problemIds },
      status: 'Accepted',
    },
    _count: {
      _all: true,
    },
  })

  const acceptedMap = new Map(acceptedSubmissions.map((s) => [s.problemId, s._count._all]))
  for (const sub of contestSubmissions) {
    contestStats[sub.problemId] = {
      accepted: acceptedMap.get(sub.problemId) || 0,
      submitted: sub._count._all,
    }
  }

  const problemsWithStatus = contestProblems.map((cp) => {
    const stats = contestStats[cp.problemId] || { accepted: 0, submitted: 0 }
    return {
      id: cp.problemId,
      orderIndex: cp.orderIndex,
      score: cp.score,
      label: String.fromCharCode(65 + cp.orderIndex),
      title: cp.problem.title,
      problemNumber: cp.problem.problemNumber,
      difficulty: cp.problem.difficulty,
      visibility: cp.problem.visibility,
      isPublic: cp.problem.isPublic,
      accepted: stats.accepted,
      submitted: stats.submitted,
      status: currentUser ? userSubmissionStatus[cp.problemId] : null,
    }
  })

  return ok(problemsWithStatus)
})
