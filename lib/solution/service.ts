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

/**
 * 清空题解详情缓存
 * （被 updateUserSolution / deleteUserSolution / toggleSolutionLike / 浏览数自增 等调用）
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
  likes: true,
  isOfficial: true,
  isAiGenerated: true,
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
  isAdmin: boolean
}

export async function loadSolutionViewUser(
  request: import('next/server').NextRequest
): Promise<SolutionViewUserPayload | null> {
  const { getUserFromRequest } = await import('@/lib/auth')
  const payload = getUserFromRequest(request)
  if (!payload) return null
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isAdmin: true },
  })
  if (!dbUser) return null
  return {
    id: dbUser.id,
    role: dbUser.role || 'user',
    isAdmin: dbUser.isAdmin || payload.isAdmin === true,
  }
}

/**
 * 题解列表（带权限校验 + 点赞状态）
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
  const { getLikedSolutionIds } = await import('./like-helper')

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

  const likedSet = await getLikedSolutionIds(viewer?.id, items.map((it) => it.id))
  const itemsWithLiked = items.map((it) => ({ ...it, isLiked: likedSet.has(it.id) }))
  return {
    found: true as const,
    allowed: true,
    items: itemsWithLiked,
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
    const err: any = new Error('problemId 不能为空')
    err.status = 400
    throw err
  }
  if (typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 100) {
    const err: any = new Error('标题长度需在 1-100 字符之间')
    err.status = 400
    throw err
  }
  if (typeof input.content !== 'string' || input.content.length < 10 || input.content.length > 50000) {
    const err: any = new Error('内容长度需在 10-50000 字符之间')
    err.status = 400
    throw err
  }
  const { resolveProblemId } = await import('./problem-resolver')
  const realProblemId = await resolveProblemId(input.problemId)
  if (!realProblemId) {
    const err: any = new Error('题目不存在')
    err.status = 404
    throw err
  }
  return prisma.solution.create({
    data: {
      problemId: realProblemId,
      authorId,
      title: input.title,
      content: input.content,
      codeLanguage: input.codeLanguage ?? null,
      code: input.code ?? null,
      isOfficial: false,
      isAiGenerated: false,
      sourceType: 'USER',
    },
    include: {
      author: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
    },
  })
}

/**
 * 获取题解详情（含权限校验、isLiked、浏览 +1）
 */
export async function getSolutionDetailWithPermission(
  id: string,
  isAssignmentContext: boolean,
  viewer: SolutionViewUserPayload | null,
  viewerUserId: string | undefined,
  ip: string
) {
  const { canViewSolutions } = await import('./permissions')
  const { isSolutionLiked } = await import('./like-helper')
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

  // 查询当前用户是否已点赞
  const liked = await isSolutionLiked(viewerUserId, id)

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
    solution: { ...solution, isLiked: liked },
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
    const err: any = new Error('题解不存在')
    err.status = 404
    throw err
  }
  const isAuthor = solution.authorId === requesterId
  if (!isAuthor && !isAdmin && !isTeacher) {
    const err: any = new Error('无权修改此题解')
    err.status = 403
    throw err
  }
  const data: any = {}
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 100) {
      const err: any = new Error('标题长度需在 1-100 字符之间')
      err.status = 400
      throw err
    }
    data.title = input.title
  }
  if (input.content !== undefined) {
    if (typeof input.content !== 'string' || input.content.length < 10 || input.content.length > 50000) {
      const err: any = new Error('内容长度需在 10-50000 字符之间')
      err.status = 400
      throw err
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
    const err: any = new Error('题解不存在')
    err.status = 404
    throw err
  }
  const isAuthor = solution.authorId === requesterId
  if (!isAuthor && !isAdmin && !isTeacher) {
    const err: any = new Error('无权删除此题解')
    err.status = 403
    throw err
  }
  // 先删除关联评论，再删除题解
  await prisma.comment.deleteMany({ where: { solutionId: id } })
  await prisma.solution.delete({ where: { id } })
  clearSolutionCache(id)
}

/**
 * 切换题解点赞（带权限校验）
 */
export async function toggleSolutionLike(
  id: string,
  isAssignmentContext: boolean,
  requesterId: string,
  viewer: SolutionViewUserPayload | null
) {
  const { canViewSolutions } = await import('./permissions')
  const { getSolutionLikeModel } = await import('./like-helper')
  const { logger } = await import('@/lib/logger')

  const solution = await prisma.solution.findUnique({
    where: { id },
    select: { id: true, problemId: true },
  })
  if (!solution) {
    const err: any = new Error('题解不存在')
    err.status = 404
    throw err
  }
  const permission = await canViewSolutions(viewer, solution.problemId, { isAssignmentContext })
  if (!permission.allowed) {
    const err: any = new Error('无权操作此题解')
    err.status = 403
    err.permission = permission
    throw err
  }

  const solutionLikeModel = getSolutionLikeModel()
  if (!solutionLikeModel) {
    logger.error('prisma.solutionLike 模型不可用，请执行 `npx prisma generate` + `npx prisma db push`')
    const err: any = new Error('点赞功能暂不可用，请联系管理员执行 prisma generate')
    err.status = 503
    throw err
  }

  const existing = await solutionLikeModel.findUnique({
    where: { solutionId_userId: { solutionId: id, userId: requesterId } },
  })

  if (existing) {
    await prisma.$transaction([
      solutionLikeModel.delete({ where: { id: existing.id } }),
      prisma.solution.update({ where: { id }, data: { likes: { decrement: 1 } } }),
    ])
    const updated = await prisma.solution.findUnique({ where: { id }, select: { likes: true } })
    clearSolutionCache(id)
    return { liked: false, likes: updated?.likes ?? 0 }
  }
  try {
    await prisma.$transaction([
      solutionLikeModel.create({ data: { solutionId: id, userId: requesterId } }),
      prisma.solution.update({ where: { id }, data: { likes: { increment: 1 } } }),
    ])
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err
  }
  const updated = await prisma.solution.findUnique({ where: { id }, select: { likes: true } })
  clearSolutionCache(id)
  return { liked: true, likes: updated?.likes ?? 0 }
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
    const err: any = new Error('题目不存在')
    err.status = 404
    throw err
  }
  const result = await canViewSolutions(viewer, realProblemId, { isAssignmentContext })
  return {
    allowed: result.allowed,
    reason: result.reason,
    bestScore: result.bestScore,
    requiredScore: REQUIRED_SOLUTION_SCORE,
  }
}
