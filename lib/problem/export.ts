/**
 * lib/problem/export.ts
 * 公共题库列表 / 创建（原 /api/problems）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/** 公共列表返回的题目轻量字段（不含 description/stdCode/spjCode 等大字段） */
export type PublicProblemListItem = Prisma.ProblemGetPayload<{
  select: {
    id: true
    problemNumber: true
    title: true
    difficulty: true
    tags: true
    source: true
    timeLimit: true
    memoryLimit: true
    totalSubmit: true
    totalAccepted: true
    createdAt: true
  }
}>

export interface ListPublicProblemsResult {
  problems: PublicProblemListItem[]
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
  /** 多值：逗号分隔，OR 语义 */
  difficulty?: string
  /** 多值：逗号分隔，OR 语义（任意命中即匹配） */
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
      // 与分页分支保持同一轻量字段集，避免竞赛加题拉回 spjCode 等大字段
      select: {
        id: true,
        problemNumber: true,
        title: true,
        difficulty: true,
        tags: true,
        source: true,
        timeLimit: true,
        memoryLimit: true,
        totalSubmit: true,
        totalAccepted: true,
        createdAt: true,
      },
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
  // 多值筛选（逗号分隔）：难度 OR、标签 OR（hasSome = 命中任意标签）
  const difficulties = difficulty
    ? difficulty.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const tags = tag
    ? tag.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  if (difficulties.length > 0) where.difficulty = { in: difficulties }
  if (tags.length > 0) where.tags = { hasSome: tags }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      // 列表只需轻量字段，剔除 description/input/output/background/hint/samples/stdCode/spjCode 等大字段
      // （spjCode 上限 512KB，stdCode 可能数 KB，description 可能数 KB，全拉回会严重拖慢列表响应）
      select: {
        id: true,
        problemNumber: true,
        title: true,
        difficulty: true,
        tags: true,
        source: true,
        timeLimit: true,
        memoryLimit: true,
        totalSubmit: true,
        totalAccepted: true,
        createdAt: true,
      },
    }),
    prisma.problem.count({ where }),
  ])

  // 实时聚合当前页题目的提交数和 AC 数，与详情页口径统一
  // 避免增量计数（$inc）在重测/回滚路径漏更新导致列表与详情不一致
  if (items.length > 0) {
    const problemIds = items.map((p) => p.id)
    const [submitGroups, acGroups] = await Promise.all([
      prisma.submission.groupBy({
        by: ['problemId'],
        where: { problemId: { in: problemIds } },
        _count: { _all: true },
      }),
      prisma.submission.groupBy({
        by: ['problemId'],
        where: { problemId: { in: problemIds }, status: 'AC' },
        _count: { _all: true },
      }),
    ])
    const submitMap = new Map(submitGroups.map((g) => [g.problemId, g._count._all]))
    const acMap = new Map(acGroups.map((g) => [g.problemId, g._count._all]))
    // 异步回填 denormalized 字段（fire-and-forget，不阻塞列表响应）
    for (const p of items) {
      const liveSubmit = submitMap.get(p.id) ?? 0
      const liveAc = acMap.get(p.id) ?? 0
      if (p.totalSubmit !== liveSubmit || p.totalAccepted !== liveAc) {
        // 不 await：写库失败不影响列表返回，下次列表会再次检测并回填
        prisma.problem.update({
          where: { id: p.id },
          data: { totalSubmit: liveSubmit, totalAccepted: liveAc },
        }).catch(() => {})
      }
    }
    // 覆盖返回值，确保前端拿到实时数据
    for (const p of items) {
      const liveP = p as { totalSubmit: number; totalAccepted: number }
      liveP.totalSubmit = submitMap.get(p.id) ?? 0
      liveP.totalAccepted = acMap.get(p.id) ?? 0
    }
  }

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
