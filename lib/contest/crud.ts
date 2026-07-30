/**
 * lib/contest/crud.ts
 * 竞赛基础 CRUD、报名、排名缓存
 */
import { prisma } from '@/lib/prisma'
import type { Contest, Prisma } from '@prisma/client'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import { CacheKeys } from '@/lib/constants/cache-keys'

export interface ContestFilter {
  keyword?: string
  status?: 'upcoming' | 'running' | 'finished'
  isPublic?: boolean
  type?: string
}

export async function listContests(
  filter: ContestFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<Contest>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: Prisma.ContestWhereInput = {}
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

export async function createContest(data: Omit<Prisma.ContestUncheckedCreateInput, 'authorId'>, authorId: string) {
  cache.deleteByPrefix('contest:list:')
  return prisma.contest.create({ data: { ...data, authorId } })
}

export async function updateContest(id: string, data: Prisma.ContestUncheckedUpdateInput) {
  cache.delete(CacheKeys.contest.byId(id))
  cache.deleteByPrefix('contest:list:')
  cache.deleteByPrefix('contest:rank')
  return prisma.contest.update({ where: { id }, data })
}

export async function deleteContest(id: string) {
  cache.delete(CacheKeys.contest.byId(id))
  cache.deleteByPrefix('contest:list:')
  cache.deleteByPrefix('contest:rank')
  return prisma.contest.delete({ where: { id } })
}

export async function registerContest(contestId: string, userId: string) {
  return prisma.contestParticipant.upsert({
    where: { contestId_userId: { contestId, userId } },
    update: {},
    create: { contestId, userId },
  })
}
