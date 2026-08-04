/**
 * lib/ranking/service.ts
 * 排行榜：按解题数排名，支持总榜 / 月榜 / 周榜 / 日榜
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
import { SubmissionStatus } from '@/lib/constants/submission-status'

/** 排行榜时间维度：total 总榜 / month 月榜 / week 周榜 / day 日榜 */
export type RankingPeriod = 'total' | 'month' | 'week' | 'day'

export interface RankingUser {
  id: string
  username: string
  nickname: string | null
  solvedCount: number
  rank: string | null
  color: string | null
  avatar: string | null
  position: number
  solvedProblems: number
}

export interface RankingPage {
  users: RankingUser[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

/** 周期起点（本地时区自然日/周/月） */
function periodStart(period: RankingPeriod, now: Date = new Date()): Date | null {
  if (period === 'total') return null
  const d = new Date(now)
  if (period === 'day') {
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === 'week') {
    // 本周一 0 点
    const day = d.getDay() === 0 ? 7 : d.getDay()
    d.setDate(d.getDate() - (day - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }
  // month：本月 1 日 0 点
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 周期内每个用户的 AC 去重题数（按 userId+problemId 聚合去重） */
async function getPeriodSolvedMap(start: Date): Promise<Map<string, number>> {
  const rows = await prisma.submission.groupBy({
    by: ['userId', 'problemId'],
    where: {
      status: SubmissionStatus.ACCEPTED,
      submittedAt: { gte: start },
    },
  })
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.userId, (map.get(r.userId) || 0) + 1)
  }
  return map
}

const USER_LIST_SELECT = {
  id: true,
  username: true,
  nickname: true,
  solvedCount: true,
  rank: true,
  color: true,
  avatar: true,
} as const

/**
 * 排行榜（已禁用户剔除，带缓存 60s）
 * - total：按全量 AC 去重题数（solvedCount）
 * - month/week/day：按周期内 AC 去重题数
 */
export async function listRankingByPeriod(
  period: RankingPeriod,
  page: number,
  limit: number
): Promise<RankingPage> {
  return cache.get('ranking:list', [period, page, limit], async () => {
    const start = periodStart(period)

    // 总榜：直接读 denormalized solvedCount（含 0 分用户展示，与旧「解题榜」一致）
    if (start === null) {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: { isBanned: false },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ solvedCount: 'desc' }, { id: 'asc' }],
          select: USER_LIST_SELECT,
        }),
        prisma.user.count({ where: { isBanned: false } }),
      ])

      const rankedUsers: RankingUser[] = users.map((user, index) => ({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        solvedCount: user.solvedCount,
        rank: user.rank,
        color: user.color,
        avatar: sanitizeAvatarUrl(user.avatar),
        position: (page - 1) * limit + index + 1,
        solvedProblems: user.solvedCount,
      }))

      return {
        users: rankedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    }

    // 周期榜：按周期内 AC 去重题数降序，仅展示周期内有 AC 的用户
    const solvedMap = await getPeriodSolvedMap(start)
    const entries = Array.from(solvedMap.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])

    const total = entries.length
    const pageEntries = entries.slice((page - 1) * limit, (page - 1) * limit + limit)

    let users: RankingUser[] = []
    if (pageEntries.length > 0) {
      const userIds = pageEntries.map(([userId]) => userId)
      const rows = await prisma.user.findMany({
        where: { id: { in: userIds }, isBanned: false },
        select: USER_LIST_SELECT,
      })
      const rowMap = new Map(rows.map((u) => [u.id, u]))
      const scoreMap = new Map(pageEntries)

      users = pageEntries
        .filter(([userId]) => rowMap.has(userId))
        .map(([userId], index) => {
          const user = rowMap.get(userId)!
          return {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            solvedCount: scoreMap.get(userId) || 0,
            rank: user.rank,
            color: user.color,
            avatar: sanitizeAvatarUrl(user.avatar),
            position: (page - 1) * limit + index + 1,
            solvedProblems: scoreMap.get(userId) || 0,
          }
        })
    }

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }, { ttl: 60_000 })
}

/**
 * 当前用户的实时排名（按周期计算；total 读 solvedCount，周期榜按窗口内 AC 去重题数）
 */
export async function getMyRankAdvanced(userId: string, period: RankingPeriod = 'total') {
  return cache.get('ranking:myRankAdvanced', [userId, period], async () => {
    const start = periodStart(period)
    let myScore = 0

    if (start === null) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { solvedCount: true },
      })
      if (!me) return null
      myScore = me.solvedCount
      const higher = await prisma.user.count({
        where: { isBanned: false, solvedCount: { gt: myScore } },
      })
      return { rank: higher + 1, solvedCount: myScore, userId }
    }

    const solvedMap = await getPeriodSolvedMap(start)
    // 周期榜需排除被封禁用户（与 total 榜一致）
    myScore = solvedMap.get(userId) || 0
    const bannedIds = new Set(
      (
        await prisma.user.findMany({
          where: { isBanned: true },
          select: { id: true },
        })
      ).map((u) => u.id)
    )
    let higher = 0
    for (const [uid, count] of solvedMap) {
      if (bannedIds.has(uid)) continue
      if (count > myScore) higher++
    }
    return { rank: higher + 1, solvedCount: myScore, userId }
  }, { ttl: 30_000 })
}

/**
 * 清空所有排行榜相关缓存
 * （adminUpdateUser / adminDeleteUser / batchUpdateUserRole / batchDeleteUsers 等
 *  影响 solvedCount / isBanned 的操作都需要清榜单）
 */
export function clearRankingCache() {
  cache.deleteByPrefix('ranking:global')
  cache.deleteByPrefix('ranking:class')
  cache.deleteByPrefix('ranking:myRank')
  cache.deleteByPrefix('ranking:myRankAdvanced')
  cache.deleteByPrefix('ranking:list')
}
