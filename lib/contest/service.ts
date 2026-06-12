/**
 * lib/contest/service.ts
 * 竞赛 CRUD、报名、榜单
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface ContestFilter {
  keyword?: string
  status?: 'upcoming' | 'running' | 'finished'
  isPublic?: boolean
  type?: string
}

export async function listContests(
  filter: ContestFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.type) where.type = filter.type

  const now = new Date()
  if (filter.status === 'upcoming') where.startTime = { gt: now }
  if (filter.status === 'running') {
    where.startTime = { lte: now }
    where.endTime = { gt: now }
  }
  if (filter.status === 'finished') where.endTime = { lt: now }

  const [items, total] = await Promise.all([
    prisma.contest.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'startTime']: options.sortOrder || 'desc' },
    }),
    prisma.contest.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getContestById(id: string) {
  return cache.get('contest:byId', [id], async () => {
    return prisma.contest.findUnique({
      where: { id },
      include: { problems: { include: { problem: true }, orderBy: { orderIndex: 'asc' } } },
    })
  }, { ttl: 30_000 })
}

export async function createContest(data: any, authorId: string) {
  return prisma.contest.create({ data: { ...data, authorId } })
}

export async function updateContest(id: string, data: any) {
  cache.delete(`contest:byId:${id}`)
  return prisma.contest.update({ where: { id }, data })
}

export async function deleteContest(id: string) {
  cache.delete(`contest:byId:${id}`)
  return prisma.contest.delete({ where: { id } })
}

export async function registerContest(contestId: string, userId: string) {
  return prisma.contestParticipant.upsert({
    where: { contestId_userId: { contestId, userId } },
    update: {},
    create: { contestId, userId },
  })
}

export async function getContestRank(contestId: string, limit = 100) {
  return cache.get('contest:rank', [contestId, limit], async () => {
    return prisma.contestParticipant.findMany({
      where: { contestId },
      take: limit,
      orderBy: { score: 'desc' },
      include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}