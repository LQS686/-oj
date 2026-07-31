/**
 * lib/problem/export.ts
 * 公共题库列表 / 创建（原 /api/problems）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export interface ListPublicProblemsResult {
  problems: Prisma.ProblemGetPayload<object>[]
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
  /** 按题号精确批量查询（竞赛批量加题）；存在时忽略分页过滤语义，最多 100 个 */
  numbers?: string[]
}): Promise<ListPublicProblemsResult> {
  const { page, pageSize, search, difficulty, tag, numbers } = filter

  if (numbers && numbers.length > 0) {
    const unique = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))].slice(0, 100)
    const items = await prisma.problem.findMany({
      where: {
        visibility: 'public',
        OR: [
          { problemNumber: { in: unique } },
          { problemNumber: { in: unique.map((n) => n.toUpperCase()) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    // 按请求顺序去重（大小写不敏感）
    const byNumber = new Map(
      items
        .filter((p) => !!p.problemNumber)
        .map((p) => [p.problemNumber!.toUpperCase(), p])
    )
    const ordered = unique
      .map((n) => byNumber.get(n.toUpperCase()))
      .filter((p): p is (typeof items)[number] => !!p)
    return {
      problems: ordered,
      pagination: {
        total: ordered.length,
        page: 1,
        pageSize: ordered.length || 1,
        totalPages: 1,
      },
    }
  }

  const where: Prisma.ProblemWhereInput = { visibility: 'public' }
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
