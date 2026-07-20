/**
 * lib/solution/service.ts
 * 题解 CRUD
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { AppError } from '@/lib/errors'
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
  cache.deleteByPrefix('solution:list:')
  return prisma.solution.create({ data: { ...data, authorId } })
}

export async function updateSolution(id: string, data: any) {
  // LOGIC-09: 先写 DB 再清缓存；同时补清列表前缀，避免列表仍展示旧数据
  const result = await prisma.solution.update({ where: { id }, data })
  cache.delete(`solution:byId:${id}`)
  cache.deleteByPrefix('solution:list:')
  return result
}

export async function deleteSolution(id: string) {
  cache.delete(`solution:byId:${id}`)
  cache.deleteByPrefix('solution:list:')
  return prisma.solution.delete({ where: { id } })
}

/**
 * 清空题解详情缓存
 * （被 updateUserSolution / deleteUserSolution / 浏览数自增 等调用）
 */
export function clearSolutionCache(id: string) {
  cache.delete(`solution:byId:${id}`)
}

export async function incrementViewCount(id: string) {
  return prisma.solution.update({
    where: { id },
    data: { views: { increment: 1 } },
  })
}

/* ============================================================================
 * 业务封装：原 /api/solutions 路由中的复杂逻辑
 * ========================================================================== */

const SOLUTION_LIST_SELECT = {
  id: true,
  title: true,
  codeLanguage: true,
  views: true,
  isOfficial: true,
  sourceType: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
    },
  },
} as const

/**
 * 从 JWT 解析 + 二次查 role 字段（permissions 工具需要）。
 */
export interface SolutionViewUserPayload {
  id: string
  role: string
}

export async function loadSolutionViewUser(
  request: import('next/server').NextRequest
): Promise<SolutionViewUserPayload | null> {
  const { getUserFromRequest } = await import('@/lib/auth')
  const payload = getUserFromRequest(request)
  if (!payload) return null
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!dbUser) return null
  return {
    id: dbUser.id,
    role: dbUser.role || 'STUDENT',
  }
}

/**
 * 题解列表（带权限校验）
 */
export async function listSolutionsWithPermission(
  problemId: string,
  isAssignmentContext: boolean,
  page: number,
  pageSize: number,
  viewer: SolutionViewUserPayload | null
) {
  const { canViewSolutions } = await import('./permissions')
  const { resolveProblemId } = await import('./problem-resolver')

  const realProblemId = await resolveProblemId(problemId)
  if (!realProblemId) return { found: false as const }
  const permission = await canViewSolutions(viewer, realProblemId, { isAssignmentContext })
  if (!permission.allowed) {
    return { found: true as const, allowed: false, permission }
  }

  const where = { problemId: realProblemId }
  const [items, total] = await Promise.all([
    prisma.solution.findMany({
      where,
      select: SOLUTION_LIST_SELECT,
      orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.solution.count({ where }),
  ])

  return {
    found: true as const,
    allowed: true,
    items,
    total,
    page,
    pageSize,
    permission,
    problemId: realProblemId,
  }
}

/**
 * 创建题解（带 problemId 解析 + 长度校验）
 */
export interface CreateSolutionInput {
  problemId: string
  title: string
  content: string
  codeLanguage?: string | null
  code?: string | null
}

export async function createUserSolution(input: CreateSolutionInput, authorId: string) {
  if (!input.problemId || typeof input.problemId !== 'string') {
    throw AppError.badRequest('VALIDATION', 'problemId 不能为空')
  }
  if (typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 100) {
    throw AppError.badRequest('VALIDATION', '标题长度需在 1-100 字符之间')
  }
  if (typeof input.content !== 'string' || input.content.length < 10 || input.content.length > 50000) {
    throw AppError.badRequest('VALIDATION', '内容长度需在 10-50000 字符之间')
  }
  const { resolveProblemId } = await import('./problem-resolver')
  const realProblemId = await resolveProblemId(input.problemId)
  if (!realProblemId) {
    throw AppError.notFound('题目不存在')
  }
  const result = await prisma.solution.create({
    data: {
      problemId: realProblemId,
      authorId,
      title: input.title,
      content: input.content,
      codeLanguage: input.codeLanguage ?? null,
      code: input.code ?? null,
      isOfficial: false,
      sourceType: 'USER',
    },
    include: {
      author: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
    },
  })
  cache.deleteByPrefix('solution:list:')
  return result
}

/**
 * 获取题解详情（含权限校验、浏览 +1）
 */
export async function getSolutionDetailWithPermission(
  id: string,
  isAssignmentContext: boolean,
  viewer: SolutionViewUserPayload | null,
  viewerUserId: string | undefined,
  ip: string
) {
  const { canViewSolutions } = await import('./permissions')
  const { recordUniqueView } = await import('./view-helper')
  const { logger } = await import('@/lib/logger')

  const solution = await prisma.solution.findUnique({
    where: { id },
    include: {
      author: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
    },
  })
  if (!solution) return { found: false as const }

  const permission = await canViewSolutions(viewer, solution.problemId, { isAssignmentContext })
  if (!permission.allowed) return { found: true as const, allowed: false, permission }

  // 浏览数 +1（按 userId/IP 去重）
  recordUniqueView(id, viewerUserId ?? null, ip)
    .then((isNew) => {
      if (isNew) {
        return prisma.solution.update({
          where: { id },
          data: { views: { increment: 1 } },
        }).then(() => {
          clearSolutionCache(id)
        })
      }
      return null
    })
    .catch((err) => logger.error('题解浏览数自增失败', err))

  return {
    found: true as const,
    allowed: true,
    solution,
    permission,
  }
}

/**
 * 更新题解（作者 / 管理员 / 教师）
 */
export interface UpdateSolutionInput {
  title?: string
  content?: string
  codeLanguage?: string | null
  code?: string | null
}

export async function updateUserSolution(
  id: string,
  requesterId: string,
  isAdmin: boolean,
  isTeacher: boolean,
  input: UpdateSolutionInput
) {
  const solution = await prisma.solution.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  })
  if (!solution) {
    throw AppError.notFound('题解不存在')
  }
  const isAuthor = solution.authorId === requesterId
  if (!isAuthor && !isAdmin && !isTeacher) {
    throw AppError.forbidden('无权修改此题解')
  }
  const data: any = {}
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 100) {
      throw AppError.badRequest('VALIDATION', '标题长度需在 1-100 字符之间')
    }
    data.title = input.title
  }
  if (input.content !== undefined) {
    if (typeof input.content !== 'string' || input.content.length < 10 || input.content.length > 50000) {
      throw AppError.badRequest('VALIDATION', '内容长度需在 10-50000 字符之间')
    }
    data.content = input.content
  }
  if (input.codeLanguage !== undefined) {
    data.codeLanguage = input.codeLanguage === null ? null : String(input.codeLanguage)
  }
  if (input.code !== undefined) {
    data.code = input.code === null ? null : String(input.code)
  }
  const updated = await prisma.solution.update({
    where: { id },
    data,
    include: {
      author: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
    },
  })
  clearSolutionCache(id)
  return updated
}

/**
 * 删除题解（作者 / 管理员 / 教师）
 */
export async function deleteUserSolution(
  id: string,
  requesterId: string,
  isAdmin: boolean,
  isTeacher: boolean
) {
  const solution = await prisma.solution.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  })
  if (!solution) {
    throw AppError.notFound('题解不存在')
  }
  const isAuthor = solution.authorId === requesterId
  if (!isAuthor && !isAdmin && !isTeacher) {
    throw AppError.forbidden('无权删除此题解')
  }
  await prisma.solution.delete({ where: { id } })
  clearSolutionCache(id)
  // LOGIC-10: 补清列表缓存，避免列表仍展示已删除的题解
  cache.deleteByPrefix('solution:list:')
}

/**
 * 题解权限预检（公开）
 */
export async function checkSolutionPermission(
  problemId: string,
  isAssignmentContext: boolean,
  viewer: SolutionViewUserPayload | null
) {
  const { canViewSolutions, REQUIRED_SOLUTION_SCORE } = await import('./permissions')
  const { resolveProblemId } = await import('./problem-resolver')
  const realProblemId = await resolveProblemId(problemId)
  if (!realProblemId) {
    throw AppError.notFound('题目不存在')
  }
  const result = await canViewSolutions(viewer, realProblemId, { isAssignmentContext })
  return {
    allowed: result.allowed,
    reason: result.reason,
    bestScore: result.bestScore,
    requiredScore: REQUIRED_SOLUTION_SCORE,
  }
}
