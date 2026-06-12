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
    return Promise.all(users.map(async (u, idx) => {
      const solved = await prisma.submission.count({ where: { userId: u.id, status: 'ACCEPTED' } })
      return {
        rank: idx + 1,
        userId: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        score: u.rating,
        solvedCount: solved,
        submissionCount: u._count.submissions,
      }
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
    return Promise.all(members.map(async (m, idx) => {
      const solved = await prisma.submission.count({
        where: { userId: m.user.id, status: 'ACCEPTED' },
      })
      return {
        rank: idx + 1,
        userId: m.user.id,
        username: m.user.username,
        nickname: m.user.nickname,
        avatar: m.user.avatar,
        score: m.user.rating,
        solvedCount: solved,
        submissionCount: m.user._count.submissions,
      }
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
