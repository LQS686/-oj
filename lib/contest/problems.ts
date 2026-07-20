/**
 * lib/contest/problems.ts
 * 竞赛题目列表（含个人提交状态 + 整体统计）
 */
import { prisma } from '@/lib/prisma'

/* ============================================================================
 * 竞赛题目列表（含个人提交状态 + 整体统计）原 /api/contests/[id]/problems
 * ========================================================================== */

export async function listContestProblemsWithStatus(
  contestId: string,
  currentUserId: string | null
) {
  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
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

  const problemIds = contestProblems.map((cp: any) => cp.problemId)
  const userSubmissionStatus: Record<string, 'Accepted' | 'Attempted' | null> = {}
  const contestStats: Record<string, { accepted: number; submitted: number }> = {}

  if (currentUserId) {
    const submissions = await prisma.submission.findMany({
      where: { contestId, problemId: { in: problemIds }, userId: currentUserId },
      select: { problemId: true, status: true },
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

  const [contestSubmissions, acceptedSubmissions] = await Promise.all([
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { contestId, problemId: { in: problemIds } },
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { contestId, problemId: { in: problemIds }, status: 'AC' },
      _count: { _all: true },
    }),
  ])

  const acceptedMap = new Map<any, any>(acceptedSubmissions.map((s: any) => [s.problemId, s._count._all]))
  for (const sub of contestSubmissions) {
    contestStats[sub.problemId] = {
      accepted: acceptedMap.get(sub.problemId) || 0,
      submitted: sub._count._all,
    }
  }

  return contestProblems.map((cp: any) => {
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
      status: currentUserId ? userSubmissionStatus[cp.problemId] : null,
    }
  })
}
