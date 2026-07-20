/**
 * lib/problem/export.ts
 * 公共题库列表 / 创建（原 /api/problems）
 */
import { prisma } from '@/lib/prisma'

export interface ListPublicProblemsResult {
  problems: any[]
  pagination: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

/** 公共题库列表（分页 + 关键字 + 难度 + tag 过滤）
 *
 * 关键字搜索字段（参考 HOJ ProblemMapper.xml getProblemList）：
 *   - title 模糊匹配（insensitive）
 *   - problemNumber 模糊匹配（让用户可直接搜索 "P1001" 或 "1001"）
 *   - source 模糊匹配（题目来源，如 "洛谷 P1001"、"Codeforces 1234A"）
 */
export async function listPublicProblems(filter: {
  page: number
  pageSize: number
  search?: string
  difficulty?: string
  tag?: string
}): Promise<ListPublicProblemsResult> {
  const { page, pageSize, search, difficulty, tag } = filter
  const where: any = { isPublic: true }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { problemNumber: { contains: search, mode: 'insensitive' } },
      { source: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (difficulty) where.difficulty = difficulty
  if (tag) where.tags = { has: tag }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.problem.count({ where }),
  ])

  return {
    problems: items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

/** 按 title 检查是否已存在同名题目 */
export async function findProblemByTitle(title: string) {
  return prisma.problem.findFirst({ where: { title } })
}
