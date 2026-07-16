/**
 * 全局搜索
 * GET /api/search?q=关键词&limit=10
 * 搜索题目、用户、竞赛
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ q?: string; limit?: string }>(req)
  const keyword = (q.q || '').trim()
  const limit = Math.min(20, Math.max(1, parseInt(q.limit || '10') || 10))

  if (!keyword) {
    return ok({ problems: [], users: [], contests: [] })
  }

  const [problems, users, contests] = await Promise.all([
    prisma.problem.findMany({
      where: {
        visibility: 'public',
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { problemNumber: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        problemNumber: true,
        title: true,
        difficulty: true,
        totalAccepted: true,
        totalSubmit: true,
      },
      take: limit,
      orderBy: { totalAccepted: 'desc' },
    }),
    prisma.user.findMany({
      where: {
        isBanned: false,
        OR: [
          { username: { contains: keyword, mode: 'insensitive' } },
          { nickname: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        rating: true,
      },
      take: limit,
      orderBy: { rating: 'desc' },
    }),
    prisma.contest.findMany({
      where: {
        isPublic: true,
        title: { contains: keyword, mode: 'insensitive' },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
      },
      take: limit,
      orderBy: { startTime: 'desc' },
    }),
  ])

  return ok({ problems, users, contests })
})
