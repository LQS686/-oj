/**
 * lib/problem/crud.ts
 * 题目基础 CRUD、标签、状态统计
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import type { Difficulty } from '@/lib/constants'
import { clearProblemCache } from './admin'
import { deleteTestCaseFiles } from './testcase'
import { logger } from '@/lib/logger'

export interface ProblemListFilter {
  keyword?: string
  tagIds?: string[]
  difficulty?: Difficulty
  isPublic?: boolean
  categoryId?: string
}

export async function listProblemTags(): Promise<string[]> {
  const problems = await prisma.problem.findMany({
    where: {
      OR: [{ isPublic: true }, { visibility: 'public' }],
    },
    select: { tags: true },
  })

  const tagSet = new Set<string>()
  problems.forEach((p: any) => {
    if (Array.isArray(p.tags)) {
      p.tags.forEach((tag: any) => {
        if (tag && typeof tag === 'string' && tag.trim()) {
          tagSet.add(tag.trim())
        }
      })
    }
  })

  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
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
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.tagIds?.length) where.tags = { hasSome: filter.tagIds }

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
  const problem = await prisma.problem.create({ data: { ...data, authorId } })
  clearProblemCache(problem.id)
  return problem
}

export async function updateProblem(id: string, data: any) {
  // LOGIC-09: 先写 DB 再清缓存，避免缓存清空后、DB 写入前出现缓存击穿读到旧值
  const result = await prisma.problem.update({ where: { id }, data })
  clearProblemCache(id)
  return result
}

export async function deleteProblem(id: string) {
  // LOGIC-09: 先写 DB 再清缓存，避免缓存清空后、DB 写入前出现缓存击穿读到旧值
  // （与 updateProblem 的顺序保持一致；原实现先清缓存再删 DB 是错误的）
  const result = await prisma.problem.delete({ where: { id } })

  // 同步清理磁盘测试点文件（DB 已删，磁盘文件不再有用）
  // 失败仅 warn，不阻塞删除流程
  try {
    await deleteTestCaseFiles(id)
  } catch (err) {
    logger.warn(`[problem] 删除题目 ${id} 的磁盘测试点文件失败`, {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  clearProblemCache(id)
  return result
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
    return groups.reduce((acc: any, g: any) => {
      acc[g.status] = g._count.status
      return acc
    }, {} as Record<string, number>)
  }, { ttl: 30_000 })
}

/**
 * 随机获取一道公开题目（参考 HOJ 题库 "随机一题" 按钮）
 *
 * 实现：count + random skip + take 1，避免 $sample 在大集合上的开销。
 * 支持与列表页一致的筛选条件（search / difficulty / tag），让"随机一题"
 * 在筛选后也能用，避免随机到不符合筛选条件的题目。
 *
 * 返回 null 表示当前筛选条件下没有可用题目。
 */
export async function getRandomPublicProblem(filter: {
  search?: string
  difficulty?: string
  tag?: string
} = {}): Promise<{ id: string; problemNumber: string | null } | null> {
  const where: any = { isPublic: true }
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { problemNumber: { contains: filter.search, mode: 'insensitive' } },
      { source: { contains: filter.search, mode: 'insensitive' } },
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.tag) where.tags = { has: filter.tag }

  const total = await prisma.problem.count({ where })
  if (total === 0) return null

  // 使用 crypto.randomBytes 防止 Math.random 的可预测性（项目硬约束）
  const { randomBytes } = await import('crypto')
  const randomBytesBuffer = randomBytes(4)
  const randomInt = randomBytesBuffer.readUInt32BE(0)
  const skip = randomInt % total

  const problem = await prisma.problem.findFirst({
    where,
    skip,
    select: { id: true, problemNumber: true },
  })
  return problem || null
}
