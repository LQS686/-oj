/**
 * lib/contest/problems.ts
 * 竞赛题目列表（含个人提交状态 + 整体统计）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import { isContestSealed } from './rankings'
import { canAccessAdmin } from '@/lib/permissions'

/* ============================================================================
 * 竞赛题目列表（含个人提交状态 + 整体统计）原 /api/contests/[id]/problems
 * ========================================================================== */

export async function listContestProblemsWithStatus(
  contestId: string,
  currentUserId: string | null,
  viewerRole?: string | null
) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      sealRankTime: true,
      sealUnlocked: true,
      authorId: true,
    },
  })

  const bypassSeal =
    (!!viewerRole && canAccessAdmin({ role: viewerRole })) ||
    (!!currentUserId && currentUserId === contest?.authorId)
  const sealed = contest ? isContestSealed(contest) : false
  const sealCutoff =
    sealed && !bypassSeal && contest?.sealRankTime ? contest.sealRankTime : null

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

  const problemIds = contestProblems.map((cp) => cp.problemId)
  const userSubmissionStatus: Record<string, 'AC' | 'Attempted' | null> = {}
  const contestStats: Record<string, { accepted: number; submitted: number }> = {}

  const baseWhere: Prisma.SubmissionWhereInput = {
    contestId,
    problemId: { in: problemIds },
  }
  if (sealCutoff) {
    baseWhere.submittedAt = { lte: sealCutoff }
  }

  if (currentUserId) {
    const submissions = await prisma.submission.findMany({
      where: { ...baseWhere, userId: currentUserId },
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
      if (statuses?.has(SubmissionStatus.ACCEPTED)) {
        userSubmissionStatus[problemId] = 'AC'
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
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { ...baseWhere, status: 'AC' },
      _count: { _all: true },
    }),
  ])

  const acceptedMap = new Map(acceptedSubmissions.map((s) => [s.problemId, s._count._all]))
  for (const sub of contestSubmissions) {
    contestStats[sub.problemId] = {
      accepted: acceptedMap.get(sub.problemId) || 0,
      submitted: sub._count._all,
    }
  }

  return contestProblems.map((cp) => {
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
