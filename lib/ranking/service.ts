/**
 * lib/ranking/service.ts
 * 排行榜：综合榜、班级榜
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'

export type RankingType = 'global' | 'class' | 'contest' | 'weekly'

export interface RankingItem {
  rank: number
  userId: string
  username: string
  nickname: string | null
  avatar: string | null
  score: number
  solvedCount: number
  submissionCount: number
}

export async function getGlobalRanking(limit = 100): Promise<RankingItem[]> {
  return cache.get('ranking:global', [limit], async () => {
    const users = await prisma.user.findMany({
      take: limit,
      orderBy: { rating: 'desc' },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        rating: true,
        _count: { select: { submissions: true } },
      },
    })

    const userIds = users.map(u => u.id)
    const acCounts = await prisma.submission.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'AC' },
      _count: { id: true },
    })
    const acMap = new Map(acCounts.map(r => [r.userId, r._count.id]))

    return users.map((u, idx) => ({
      rank: idx + 1,
      userId: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      score: u.rating,
      solvedCount: acMap.get(u.id) || 0,
      submissionCount: u._count.submissions,
    }))
  }, { ttl: 60_000 })
}

export async function getClassRanking(classId: string, limit = 100): Promise<RankingItem[]> {
  return cache.get('ranking:class', [classId, limit], async () => {
    const members = await prisma.classMember.findMany({
      where: { classId },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            rating: true,
            _count: { select: { submissions: true } },
          },
        },
      },
    })
    members.sort((a, b) => (b.user.rating || 0) - (a.user.rating || 0))

    const userIds = members.map(m => m.user.id)
    const acCounts = await prisma.submission.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'AC' },
      _count: { id: true },
    })
    const acMap = new Map(acCounts.map(r => [r.userId, r._count.id]))

    return members.map((m, idx) => ({
      rank: idx + 1,
      userId: m.user.id,
      username: m.user.username,
      nickname: m.user.nickname,
      avatar: m.user.avatar,
      score: m.user.rating,
      solvedCount: acMap.get(m.user.id) || 0,
      submissionCount: m.user._count.submissions,
    }))
  }, { ttl: 60_000 })
}

export async function getMyRank(userId: string) {
  return cache.get('ranking:myRank', [userId], async () => {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { rating: true },
    })
    if (!me) return null
    const higher = await prisma.user.count({ where: { rating: { gt: me.rating } } })
    return { rank: higher + 1, rating: me.rating }
  }, { ttl: 60_000 })
}

/* ============================================================================
 * 业务封装：原 /api/rankings 路由中的复杂逻辑（rating / solved）
 * ========================================================================== */

export interface RankingUser {
  id: string
  username: string
  nickname: string | null
  rating: number
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

/**
 * 综合 / 已解决 排行榜（已禁用户剔除，带缓存 60s）
 */
export async function listRankingByType(type: 'rating' | 'solved', page: number, limit: number): Promise<RankingPage> {
  return cache.get('ranking:list', [type, page, limit], async () => {
    const orderBy: Record<string, string>[] = type === 'solved'
      ? [{ solvedCount: 'desc' }, { rating: 'desc' }]
      : [{ rating: 'desc' }, { solvedCount: 'desc' }]

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { isBanned: false },
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          username: true,
          nickname: true,
          rating: true,
          solvedCount: true,
          rank: true,
          color: true,
          avatar: true,
        },
      }),
      prisma.user.count({ where: { isBanned: false } }),
    ])

    const rankedUsers: RankingUser[] = users.map((user, index) => ({
      ...user,
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
  }, { ttl: 60_000 })
}

/**
 * 当前用户的实时排名（rating / solved 模式分别计算）
 */
export async function getMyRankAdvanced(userId: string, type: 'rating' | 'solved' = 'rating') {
  return cache.get('ranking:myRankAdvanced', [userId, type], async () => {
    let rank = 0
    if (type === 'solved') {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { solvedCount: true, rating: true },
      })
      if (currentUser) {
        const count = await prisma.user.count({
          where: {
            isBanned: false,
            OR: [
              { solvedCount: { gt: currentUser.solvedCount } },
              { solvedCount: currentUser.solvedCount, rating: { gt: currentUser.rating } },
            ],
          },
        })
        rank = count + 1
      }
    } else {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { rating: true, solvedCount: true },
      })
      if (currentUser) {
        const count = await prisma.user.count({
          where: {
            isBanned: false,
            OR: [
              { rating: { gt: currentUser.rating } },
              { rating: currentUser.rating, solvedCount: { gt: currentUser.solvedCount } },
            ],
          },
        })
        rank = count + 1
      }
    }
    return { rank, userId }
  }, { ttl: 30_000 })
}

/**
 * 清空所有排行榜相关缓存
 * （adminUpdateUser / adminDeleteUser / batchUpdateUserRole / batchDeleteUsers 等
 *  影响 rating / solvedCount / isBanned 的操作都需要清榜单）
 */
export function clearRankingCache() {
  cache.deleteByPrefix('ranking:global')
  cache.deleteByPrefix('ranking:class')
  cache.deleteByPrefix('ranking:myRank')
  cache.deleteByPrefix('ranking:list')
}
