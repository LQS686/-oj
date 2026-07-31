/**
 * lib/contest/seal-stats.ts
 * 封榜期间从「公开题目统计」中剔除封榜后竞赛提交，避免全局 AC 侧信道。
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isContestSealed } from './rankings'
import { canAccessAdmin } from '@/lib/permissions'
import { cache } from '@/lib/cache'

export type SealCutoff = { contestId: string; sealRankTime: Date }

/**
 * 题目关联的、当前处于封榜中的竞赛及其封榜时刻。
 */
export async function listSealedCutoffsForProblem(problemId: string): Promise<SealCutoff[]> {
  return cache.get('problem:sealedCutoffs', [problemId], async () => {
    const links = await prisma.contestProblem.findMany({
      where: { problemId },
      select: {
        contestId: true,
        contest: {
          select: { sealRankTime: true, sealUnlocked: true },
        },
      },
    })
    const out: SealCutoff[] = []
    for (const link of links) {
      const c = link.contest
      if (!c?.sealRankTime) continue
      if (!isContestSealed(c)) continue
      out.push({ contestId: link.contestId, sealRankTime: c.sealRankTime })
    }
    return out
  }, { ttl: 10_000 })
}

/**
 * 构造排除「封榜后竞赛提交」的 where 片段。
 * 未封榜时返回空数组（不影响原查询）。
 */
export async function sealedSubmissionExcludeClauses(
  problemId: string
): Promise<Prisma.SubmissionWhereInput[]> {
  const cutoffs = await listSealedCutoffsForProblem(problemId)
  return cutoffs.map((c) => ({
    NOT: {
      AND: [{ contestId: c.contestId }, { submittedAt: { gt: c.sealRankTime } }],
    },
  }))
}

/**
 * 指定竞赛上下文：封榜且查看者不可绕过时，返回截断时刻。
 */
export async function getContestSealCutoffForViewer(
  contestId: string | undefined,
  viewer?: { id: string; role?: string | null } | null
): Promise<Date | null> {
  if (!contestId) return null
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      sealRankTime: true,
      sealUnlocked: true,
      authorId: true,
    },
  })
  if (!contest || !isContestSealed(contest)) return null
  const bypass =
    canAccessAdmin(viewer ?? null) || (!!viewer?.id && viewer.id === contest.authorId)
  if (bypass) return null
  return contest.sealRankTime
}

/** 合并：竞赛上下文截断 + 全局封榜排除 */
export async function buildProblemSubmissionWhere(
  problemId: string,
  options: {
    contestId?: string
    viewer?: { id: string; role?: string | null } | null
  } = {}
): Promise<Prisma.SubmissionWhereInput> {
  const where: Prisma.SubmissionWhereInput = { problemId }
  const and: Prisma.SubmissionWhereInput[] = []

  const contestCutoff = await getContestSealCutoffForViewer(options.contestId, options.viewer)
  if (contestCutoff) {
    and.push({ submittedAt: { lte: contestCutoff } })
    if (options.contestId) {
      // 竞赛页统计：只计该竞赛提交且截断到封榜
      where.contestId = options.contestId
    }
  } else {
    and.push(...(await sealedSubmissionExcludeClauses(problemId)))
  }

  if (and.length > 0) where.AND = and
  return where
}

/**
 * 解冻后补齐：重算题目 denormalized 计数，并校正相关用户 solvedCount。
 */
export async function applyDeferredGlobalStatsAfterSealUnlock(contestId: string): Promise<void> {
  const { recountProblemSubmissionStats } = await import('@/lib/problem/stats')
  const { clearRankingCache } = await import('@/lib/ranking/service')
  const { logger } = await import('@/lib/logger')

  const problems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: { problemId: true },
  })
  for (const p of problems) {
    try {
      await recountProblemSubmissionStats(p.problemId)
    } catch (err) {
      logger.error('解冻后重算题目统计失败', err, { problemId: p.problemId })
    }
  }

  const acUsers = await prisma.submission.findMany({
    where: { contestId, status: 'AC' },
    select: { userId: true },
    distinct: ['userId'],
  })
  for (const { userId } of acUsers) {
    try {
      const groups = await prisma.submission.groupBy({
        by: ['problemId'],
        where: { userId, status: 'AC' },
      })
      await prisma.user.update({
        where: { id: userId },
        data: { solvedCount: groups.length },
      })
    } catch (err) {
      logger.error('解冻后校正 solvedCount 失败', err, { userId })
    }
  }

  clearRankingCache()
  cache.deleteByPrefix('problem:sealedCutoffs')
}
