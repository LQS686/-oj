/**
 * lib/problem/service.ts
 * 题目 CRUD、标签、状态
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface ProblemListFilter {
  keyword?: string
  tagIds?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  isPublic?: boolean
  categoryId?: string
}

export async function listProblems(
  filter: ProblemListFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
      { id: { contains: filter.keyword } },
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.tagIds?.length) where.tags = { some: { tagId: { in: filter.tagIds } } }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
    }),
    prisma.problem.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getProblemById(id: string) {
  return cache.get('problem:byId', [id], async () => {
    return prisma.problem.findUnique({ where: { id } })
  }, { ttl: 60_000 })
}

export async function createProblem(data: any, authorId: string) {
  return prisma.problem.create({ data: { ...data, authorId } })
}

export async function updateProblem(id: string, data: any) {
  cache.delete(`problem:byId:${id}`)
  return prisma.problem.update({ where: { id }, data })
}

export async function deleteProblem(id: string) {
  cache.delete(`problem:byId:${id}`)
  return prisma.problem.delete({ where: { id } })
}

export async function listTags() {
  return cache.get('problem:tags', [], async () => {
    const problems = await prisma.problem.findMany({
      where: { isPublic: true },
      select: { tags: true },
    })
    const set = new Set<string>()
    for (const p of problems) for (const t of p.tags) set.add(t)
    return Array.from(set).sort().map((name) => ({ name }))
  }, { ttl: 5 * 60_000 })
}

export async function getProblemStatusCounts(problemId: string) {
  return cache.get('problem:statusCounts', [problemId], async () => {
    const groups = await prisma.submission.groupBy({
      by: ['status'],
      where: { problemId },
      _count: { status: true },
    })
    return groups.reduce((acc: any, g) => {
      acc[g.status] = g._count.status
      return acc
    }, {} as Record<string, number>)
  }, { ttl: 30_000 })
}
