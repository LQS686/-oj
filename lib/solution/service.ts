/**
 * lib/solution/service.ts
 * 题解 CRUD
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface SolutionFilter {
  problemId?: string
  authorId?: string
  isPublic?: boolean
}

export async function listSolutions(
  filter: SolutionFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.authorId) where.authorId = filter.authorId
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic

  const [items, total] = await Promise.all([
    prisma.solution.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
    }),
    prisma.solution.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getSolutionById(id: string) {
  return cache.get('solution:byId', [id], async () => {
    return prisma.solution.findUnique({
      where: { id },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}

export async function createSolution(data: any, authorId: string) {
  return prisma.solution.create({ data: { ...data, authorId } })
}

export async function updateSolution(id: string, data: any) {
  cache.delete(`solution:byId:${id}`)
  return prisma.solution.update({ where: { id }, data })
}

export async function deleteSolution(id: string) {
  cache.delete(`solution:byId:${id}`)
  return prisma.solution.delete({ where: { id } })
}

export async function incrementViewCount(id: string) {
  return prisma.solution.update({
    where: { id },
    data: { views: { increment: 1 } },
  })
}
