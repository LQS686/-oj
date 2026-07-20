/**
 * lib/problem/export.ts
 * 批量更新来源 / 导出 / 审查 / AI 题解重生成 / 公共题库列表
 */
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/withApi'
import { clearProblemCache } from './admin'

/**
 * 批量更新题目的来源标记（AI/MANUAL/AI_ASSISTED），并写入审计日志
 */
export async function batchUpdateProblemSource(
  operatorId: string,
  problemIds: string[],
  source: 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED',
  ip: string
) {
  if (!['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].includes(source)) {
    throw new ApiError('INVALID_SOURCE', '无效的来源标记', 400)
  }
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: { aiStatus: source },
  })
  await prisma.auditLog.create({
    data: {
      userId: operatorId,
      action: 'UPDATE_PROBLEM_SOURCE',
      resource: 'problems',
      details: {
        count: result.count,
        targetSource: source,
        problemIds,
      },
      ip,
    },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 导出题目列表（按 source 过滤）
 */
export async function listProblemsForExport(source: string = 'all') {
  const where: any = {}
  if (source !== 'all') {
    where.aiStatus = source
  }
  return prisma.problem.findMany({
    where,
    select: {
      id: true,
      title: true,
      aiStatus: true,
      createdAt: true,
      updatedAt: true,
      totalSubmit: true,
      totalAccepted: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * 待审核题目列表（isAiGenerated=false）
 */
export async function listProblemsForReview() {
  return prisma.problem.findMany({
    where: { isAiGenerated: false },
    include: {
      testCases: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * 删除题目的所有 AI_OFFICIAL 题解（保留 USER 题解）
 */
export async function deleteAiOfficialSolutionsForProblem(problemId: string) {
  return prisma.solution.deleteMany({
    where: { problemId, sourceType: 'AI_OFFICIAL' } as any,
  })
}

/**
 * 获取"重新生成 AI 官方题解"所需题目信息
 */
export async function getProblemForSolutionRegeneration(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      description: true,
      input: true,
      output: true,
      samples: true,
      stdCode: true,
      stdLang: true,
      authorId: true,
    },
  })
}

/**
 * 获取当前操作者的管理员/教师信息
 */
export async function getOperatorForSolutionRegen(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isBanned: true },
  })
}

/* ============================================================================
 * 公共题库列表 / 创建（原 /api/problems）
 * ========================================================================== */

export interface ListPublicProblemsResult {
  problems: any[]
  pagination: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

/** 公共题库列表（分页 + 关键字 + 难度 + tag 过滤） */
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
      { id: { contains: search } },
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
