/**
 * lib/problem/crud.ts
 * 题目基础 CRUD、标签、状态统计
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { clearProblemCache } from './admin'
import { deleteTestCaseFiles } from './testcase'
import { logger } from '@/lib/logger'

export async function listProblemTags(): Promise<string[]> {
  // 标签集合来自全库扫描，代价高且变化频率低：缓存 5 分钟（与 listTags 历史策略一致），
  // clearProblemCache 已通过 deleteByPrefix('problem:tags') 在题目增删改时失效。
  return cache.get(CacheKeys.problem.tags(), [], async () => {
    const problems = await prisma.problem.findMany({
      where: { visibility: 'public' },
      select: { tags: true },
    })

    const tagSet = new Set<string>()
    problems.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach((tag) => {
          if (tag && typeof tag === 'string' && tag.trim()) {
            tagSet.add(tag.trim())
          }
        })
      }
    })

    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, { ttl: 5 * 60_000 })
}

export async function getProblemById(id: string) {
  return cache.get('problem:byId', [id], async () => {
    return prisma.problem.findUnique({ where: { id } })
  }, { ttl: 60_000 })
}

export async function createProblem(
  data: Prisma.ProblemUncheckedCreateInput,
  authorId: string
) {
  const problem = await prisma.problem.create({ data: { ...data, authorId } })
  clearProblemCache(problem.id)
  return problem
}

export async function updateProblem(id: string, data: Prisma.ProblemUpdateInput) {
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

export async function getProblemStatusCounts(
  problemId: string,
  options: {
    contestId?: string
    viewer?: { id: string; role?: string | null } | null
  } = {}
) {
  const { buildProblemSubmissionWhere } = await import('@/lib/contest/seal-stats')
  const where = await buildProblemSubmissionWhere(problemId, options)
  const cacheKey = [
    problemId,
    options.contestId || '',
    options.viewer?.id || 'guest',
    // 封榜状态约 10s 变化；短 TTL
  ]
  return cache.get('problem:statusCounts', cacheKey, async () => {
    const groups = await prisma.submission.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    })
    return groups.reduce((acc: Record<string, number>, g) => {
      acc[g.status] = g._count.status
      return acc
    }, {} as Record<string, number>)
  }, { ttl: 10_000 })
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
  const where: Prisma.ProblemWhereInput = { visibility: 'public' }
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
