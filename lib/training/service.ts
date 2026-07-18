/**
 * lib/training/service.ts
 * 训练计划（题单）业务层
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE, type ListOptions } from '@/lib/types/common'
import type { Prisma } from '@prisma/client'
import type {
  TrainingListItem,
  PaginatedResponse,
  TrainingListQuery,
  TrainingCreateInput,
  TrainingUpdateInput,
  TrainingCategoryType,
  TrainingDetail,
  TrainingProblemItem,
  TrainingCategory,
  UserTrainingProgress,
  TrainingProblemStatus,
} from './types'

export interface TrainingFilter {
  keyword?: string
  isPublic?: boolean
  categoryId?: string
}

const TRAINING_LIST_TTL = 30_000
const TRAINING_DETAIL_TTL = 30_000

/** 缓存 key 工具 */
function listKey(filter: object, opts: object): string {
  return `training:list:${cacheHash({ filter, opts })}`
}
function byIdKey(id: string): string {
  return `training:byId:${id}`
}
function enrollmentKey(userId: string, trainingId: string): string {
  return `training:enrollment:${userId}:${trainingId}`
}
function userEnrollmentsKey(userId: string): string {
  return `training:enrollments:${userId}`
}
function categoriesKey(): string {
  return 'training:categories:all'
}
function cacheHash(input: object): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url').slice(0, 32)
}

/* ============================================================================
 * 基础 CRUD
 * ========================================================================== */

export async function listTrainings(
  filter: TrainingFilter = {},
  options: ListOptions = {}
): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId

  const [items, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
    }),
    prisma.training.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getTrainingById(id: string) {
  return cache.get('training:byId', [id], async () => {
    return prisma.training.findUnique({
      where: { id },
      include: { problems: { include: { problem: true }, orderBy: { orderIndex: 'asc' } } },
    })
  }, { ttl: TRAINING_DETAIL_TTL })
}

export async function createTraining(data: any) {
  return prisma.training.create({ data })
}

export async function updateTraining(id: string, data: any) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  return prisma.training.update({ where: { id }, data })
}

export async function deleteTraining(id: string) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  // 级联删除关联表（Prisma 关系未设 onDelete: Cascade，需手动）
  return prisma.$transaction([
    prisma.trainingProblem.deleteMany({ where: { trainingId: id } }),
    prisma.trainingEnrollment.deleteMany({ where: { trainingId: id } }),
    prisma.training.delete({ where: { id } }),
  ])
}

/* ============================================================================
 * 高级查询：公开列表（带分类/标签/作者/题目计数/用户进度）
 * ========================================================================== */

export async function listPublicTrainingsAdvanced(
  page: number,
  limit: number,
  filter: {
    keyword?: string
    difficulty?: string
    categoryId?: string
    categoryType?: 'official' | 'contest' | null
    isRecommended?: boolean
    userId?: string | null
    /** 仅返回当前用户已加入（收藏）的题单 */
    joinedOnly?: boolean
  }
): Promise<PaginatedResponse<TrainingListItem>> {
  // 公开题单：isPublic + published + 非班级私有（classId 为空）
  // 登录用户：额外可看到自己创建的私有/草稿题单（仍排除班级私有）
  const baseScope: any = filter.userId
    ? {
        OR: [
          { isPublic: true, status: 'published', classId: null },
          { authorId: filter.userId, classId: null },
        ],
      }
    : { isPublic: true, status: 'published', classId: null }

  // joinedOnly：限定为当前用户加入的题单（仍排除班级私有，因为班级题单走班级 API）
  if (filter.joinedOnly && filter.userId) {
    const joinedIds = await prisma.trainingEnrollment.findMany({
      where: { userId: filter.userId },
      select: { trainingId: true },
    })
    const joinedTrainingIds = joinedIds.map((e: any) => e.trainingId)
    // 仅保留非班级私有的题单
    const visibleJoined = await prisma.training.findMany({
      where: { id: { in: joinedTrainingIds }, classId: null },
      select: { id: true },
    })
    baseScope.id = { in: visibleJoined.map((t: any) => t.id) }
  }
  const extra: any[] = []
  if (filter.keyword) {
    extra.push({
      OR: [
        { title: { contains: filter.keyword, mode: 'insensitive' } },
        { description: { contains: filter.keyword, mode: 'insensitive' } },
      ],
    })
  }
  if (filter.difficulty) extra.push({ difficulty: filter.difficulty })
  if (filter.categoryId) extra.push({ categoryId: filter.categoryId })
  // categoryType / isRecommended 在 DB 层过滤，避免分页后过滤造成空页
  // 兼容老数据：'official' 过滤同时匹配 categoryType='official' 和 categoryType=null
  if (filter.categoryType === 'official') {
    extra.push({
      OR: [{ categoryType: 'official' }, { categoryType: null }],
    })
  } else if (filter.categoryType === 'contest') {
    extra.push({ categoryType: 'contest' })
  }
  if (filter.isRecommended === true) {
    extra.push({ isRecommended: true })
  }
  const where: any = extra.length > 0
    ? { AND: [baseScope, ...extra] }
    : baseScope

  const [trainings, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { problems: true, enrollments: true } },
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.training.count({ where }),
  ])

  // 批量拉取当前用户在这些题单上的进度
  const progressMap = new Map<string, { solvedCount: number; attemptedCount: number; isJoined: boolean }>()
  if (filter.userId && trainings.length > 0) {
    const trainingIds = trainings.map((t: any) => t.id)
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId: filter.userId, trainingId: { in: trainingIds } },
      select: { trainingId: true },
    })
    const enrolledSet = new Set(enrollments.map((e: any) => e.trainingId))

    const allProblems = await prisma.trainingProblem.findMany({
      where: { trainingId: { in: trainingIds } },
      select: { id: true, trainingId: true, problemId: true },
    })
    const problemIds = [...new Set(allProblems.map((p: any) => p.problemId))]
    const submissions = problemIds.length > 0 ? await prisma.submission.findMany({
      where: { userId: filter.userId, problemId: { in: problemIds } },
      select: { problemId: true, status: true },
    }) : []
    const acSet = new Set(submissions.filter((s: any) => s.status === 'AC').map((s: any) => s.problemId))
    const attSet = new Set(submissions.map((s: any) => s.problemId))

    for (const t of trainings) {
      const tProblems = allProblems.filter((p: any) => p.trainingId === t.id)
      const total = tProblems.length
      const solvedCount = tProblems.filter((p: any) => acSet.has(p.problemId)).length
      const attemptedCount = tProblems.filter((p: any) => attSet.has(p.problemId)).length
      progressMap.set(t.id, {
        solvedCount,
        attemptedCount,
        isJoined: enrolledSet.has(t.id),
      })
      void total
    }
  }

  const items: TrainingListItem[] = trainings.map((t: any) => {
    const p = progressMap.get(t.id)
    const total = t._count.problems
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      difficulty: t.difficulty,
      categoryType: (t.categoryType as TrainingCategoryType | null) ?? null,
      isPublic: t.isPublic,
      status: t.status,
      isRecommended: t.isRecommended,
      tags: t.tags || [],
      cover: t.cover,
      joinCount: t.joinCount,
      viewCount: t.viewCount,
      problemCount: total,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      author: t.author,
      category: t.category,
      userProgress: p
        ? {
            solvedCount: p.solvedCount,
            attemptedCount: p.attemptedCount,
            progressPercentage: total > 0 ? Math.round((p.solvedCount / total) * 100) : 0,
            isJoined: p.isJoined,
          }
        : { solvedCount: 0, attemptedCount: 0, progressPercentage: 0, isJoined: false },
    }
  })

  return {
    items,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

/* ============================================================================
 * 班级私有题单
 * ========================================================================== */

/**
 * 列出班级的所有题单（含用户进度，仅班级成员可访问）
 */
export async function listClassTrainings(
  classId: string,
  page: number,
  limit: number,
  userId?: string | null
): Promise<PaginatedResponse<TrainingListItem>> {
  const where: any = { classId }
  const [trainings, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { problems: true, enrollments: true } },
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.training.count({ where }),
  ])

  // 批量拉取当前用户进度
  const progressMap = new Map<string, { solvedCount: number; attemptedCount: number; isJoined: boolean }>()
  if (userId && trainings.length > 0) {
    const trainingIds = trainings.map((t: any) => t.id)
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId, trainingId: { in: trainingIds } },
      select: { trainingId: true },
    })
    const enrolledSet = new Set(enrollments.map((e: any) => e.trainingId))

    const allProblems = await prisma.trainingProblem.findMany({
      where: { trainingId: { in: trainingIds } },
      select: { id: true, trainingId: true, problemId: true },
    })
    const problemIds = [...new Set(allProblems.map((p: any) => p.problemId))]
    const submissions = problemIds.length > 0 ? await prisma.submission.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true, status: true },
    }) : []
    const acSet = new Set(submissions.filter((s: any) => s.status === 'AC').map((s: any) => s.problemId))
    const attSet = new Set(submissions.map((s: any) => s.problemId))

    for (const t of trainings) {
      const tProblems = allProblems.filter((p: any) => p.trainingId === t.id)
      const solvedCount = tProblems.filter((p: any) => acSet.has(p.problemId)).length
      const attemptedCount = tProblems.filter((p: any) => attSet.has(p.problemId)).length
      progressMap.set(t.id, {
        solvedCount,
        attemptedCount,
        isJoined: enrolledSet.has(t.id),
      })
    }
  }

  const items: TrainingListItem[] = trainings.map((t: any) => {
    const p = progressMap.get(t.id)
    const totalCount = t._count.problems
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      difficulty: t.difficulty,
      categoryType: (t.categoryType as TrainingCategoryType | null) ?? null,
      isPublic: t.isPublic,
      status: t.status,
      isRecommended: t.isRecommended,
      tags: t.tags || [],
      cover: t.cover,
      joinCount: t.joinCount,
      viewCount: t.viewCount,
      problemCount: totalCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      author: t.author,
      category: t.category,
      userProgress: p
        ? {
            solvedCount: p.solvedCount,
            attemptedCount: p.attemptedCount,
            progressPercentage: totalCount > 0 ? Math.round((p.solvedCount / totalCount) * 100) : 0,
            isJoined: p.isJoined,
          }
        : { solvedCount: 0, attemptedCount: 0, progressPercentage: 0, isJoined: false },
    }
  })

  return {
    items,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

/**
 * 判断用户是否为指定班级的成员（owner/assistant/student 任一）
 */
export async function isClassMember(classId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { id: true },
  })
  return !!member
}

/**
 * 判断用户是否可管理班级题单（owner 或 assistant）
 */
export async function canManageClassTraining(classId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { role: true },
  })
  if (!member) return false
  const role = member.role?.toLowerCase()
  return role === 'owner' || role === 'assistant'
}

/* ============================================================================
 * 推荐题单 / 分类
 * ========================================================================== */

export async function listRecommendedTrainings(limit = 3, userId: string | null = null) {
  return cache.get('training:recommended', [limit, userId || 'guest'], async () => {
    const trainings = await prisma.training.findMany({
      where: { isPublic: true, status: 'published', isRecommended: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { problems: true } },
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
        category: { select: { id: true, name: true } },
      },
    })
    return trainings.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      difficulty: t.difficulty,
      cover: t.cover,
      tags: t.tags,
      isRecommended: t.isRecommended,
      joinCount: t.joinCount,
      viewCount: t.viewCount,
      problemCount: t._count.problems,
      author: t.author,
      category: t.category,
      createdAt: t.createdAt,
    }))
  }, { ttl: TRAINING_LIST_TTL })
}

export async function listCategories(): Promise<TrainingCategory[]> {
  return cache.get('training:categories', ['all'], async () => {
    const items = await prisma.trainingCategory.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { trainings: true } } },
    })
    return items.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      orderIndex: c.orderIndex,
      createdAt: c.createdAt,
      _count: c._count,
    }))
  }, { ttl: 60_000 })
}

export async function createCategory(input: { name: string; description?: string; orderIndex?: number }) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.create({
    data: {
      name: input.name,
      description: input.description || null,
      orderIndex: input.orderIndex ?? 0,
    },
  })
}

export async function updateCategory(id: string, input: { name?: string; description?: string; orderIndex?: number }) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.orderIndex !== undefined ? { orderIndex: input.orderIndex } : {}),
    },
  })
}

export async function deleteCategory(id: string) {
  cache.delete(categoriesKey())
  return prisma.trainingCategory.delete({ where: { id } })
}

/* ============================================================================
 * 创建 / 更新（含题目）
 * ========================================================================== */

export async function createTrainingWithProblems(input: TrainingCreateInput) {
  const { problemIds, ...rest } = input
  const training = await prisma.training.create({
    data: {
      title: rest.title,
      description: rest.description,
      // difficulty 可选字段，仅在显式传入时设置
      ...(rest.difficulty != null ? { difficulty: rest.difficulty } : {}),
      categoryType: rest.categoryType ?? null,
      isPublic: rest.isPublic ?? true,
      status: rest.status ?? 'published',
      isRecommended: rest.isRecommended ?? false,
      authorId: rest.authorId || null,
      categoryId: rest.categoryId || null,
      tags: rest.tags || [],
      cover: rest.cover || null,
      ...(rest.classId ? { classId: rest.classId } : {}),
    },
  })
  if (problemIds && problemIds.length > 0) {
    const trainingProblems = problemIds.map((problemId, index) => ({
      trainingId: training.id,
      problemId,
      orderIndex: index,
    }))
    await prisma.trainingProblem.createMany({ data: trainingProblems })
  }
  cache.deleteByPrefix('training:list:')
  return training
}

export async function updateTrainingAndProblems(
  id: string,
  input: TrainingUpdateInput
) {
  cache.delete(byIdKey(id))
  cache.deleteByPrefix('training:list:')
  return prisma.training.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.categoryType !== undefined ? { categoryType: input.categoryType } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
    },
  })
}

/* ============================================================================
 * 题目管理（add/remove/reorder/update）
 * ========================================================================== */

export async function addTrainingProblems(
  trainingId: string,
  problems: Array<{ problemId: string; orderIndex?: number; score?: number; required?: boolean }>
) {
  cache.delete(byIdKey(trainingId))
  if (problems.length === 0) return { count: 0 }
  // 计算起始 orderIndex
  const latest = await prisma.trainingProblem.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'desc' },
    take: 1,
    select: { orderIndex: true },
  })
  let next = (latest[0]?.orderIndex ?? -1) + 1
  const data = problems.map((p: any) => ({
    trainingId,
    problemId: p.problemId,
    orderIndex: p.orderIndex ?? next++,
    score: p.score ?? 100,
    required: p.required ?? true,
  }))
  // 先查询已存在的 trainingId+problemId 组合，再批量插入未存在的
  const existingProblems = await prisma.trainingProblem.findMany({
    where: { trainingId },
    select: { problemId: true },
  })
  const existingIds = new Set(existingProblems.map(e => e.problemId))
  const toCreate = data.filter(item => !existingIds.has(item.problemId))
  let count = 0
  if (toCreate.length > 0) {
    const result = await prisma.trainingProblem.createMany({ data: toCreate })
    count = result.count
  }
  return { count }
}

export async function removeTrainingProblems(trainingId: string, problemIds: string[]) {
  cache.delete(byIdKey(trainingId))
  return prisma.trainingProblem.deleteMany({
    where: { trainingId, problemId: { in: problemIds } },
  })
}

export async function reorderTrainingProblems(
  trainingId: string,
  orderMap: Array<{ problemId: string; orderIndex: number }>
) {
  cache.delete(byIdKey(trainingId))
  await prisma.$transaction(
    orderMap.map(item =>
      prisma.trainingProblem.update({
        where: { trainingId_problemId: { trainingId, problemId: item.problemId } },
        data: { orderIndex: item.orderIndex },
      })
    )
  )
  return { count: orderMap.length }
}

export async function updateTrainingProblemItem(
  trainingId: string,
  updates: Array<{ problemId: string; score?: number; required?: boolean; orderIndex?: number }>
) {
  cache.delete(byIdKey(trainingId))
  await prisma.$transaction(
    updates.map((u: any) =>
      prisma.trainingProblem.update({
        where: { trainingId_problemId: { trainingId, problemId: u.problemId } },
        data: {
          ...(u.score !== undefined ? { score: u.score } : {}),
          ...(u.required !== undefined ? { required: u.required } : {}),
          ...(u.orderIndex !== undefined ? { orderIndex: u.orderIndex } : {}),
        },
      })
    )
  )
  return { count: updates.length }
}

/* ============================================================================
 * 加入 / 退出
 * ========================================================================== */

export async function enrollTraining(trainingId: string, userId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  })
  if (existing) return existing
  const result = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.trainingEnrollment.create({
      data: { trainingId, userId },
    })
    await tx.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: 1 } },
    })
    return enrollment
  })
  cache.delete(enrollmentKey(userId, trainingId))
  cache.delete(userEnrollmentsKey(userId))
  return result
}

export async function unenrollTraining(trainingId: string, userId: string) {
  const existing = await prisma.trainingEnrollment.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  })
  if (!existing) return null
  await prisma.$transaction(async (tx) => {
    await tx.trainingEnrollment.delete({
      where: { trainingId_userId: { trainingId, userId } },
    })
    await tx.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: -1 } },
    })
  })
  cache.delete(enrollmentKey(userId, trainingId))
  cache.delete(userEnrollmentsKey(userId))
  return existing
}

export async function isEnrolled(trainingId: string, userId: string): Promise<boolean> {
  return cache.get('training:enrollment:check', [trainingId, userId], async () => {
    const r = await prisma.trainingEnrollment.findUnique({
      where: { trainingId_userId: { trainingId, userId } },
      select: { id: true },
    })
    return !!r
  }, { ttl: 10_000 })
}

export async function getUserEnrollments(userId: string) {
  return cache.get('training:enrollments', [userId], async () => {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        training: {
          include: {
            _count: { select: { problems: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
    })
    return enrollments.map((e: any) => ({
      trainingId: e.trainingId,
      joinedAt: e.joinedAt,
      training: {
        id: e.training.id,
        title: e.training.title,
        description: e.training.description,
        difficulty: e.training.difficulty,
        cover: e.training.cover,
        tags: e.training.tags,
        problemCount: e.training._count.problems,
        category: e.training.category,
        joinCount: e.training.joinCount,
        viewCount: e.training.viewCount,
      },
    }))
  }, { ttl: 30_000 })
}

export async function incrementJoinCount(trainingId: string, delta: number) {
  try {
    await prisma.training.update({
      where: { id: trainingId },
      data: { joinCount: { increment: delta } },
    })
  } catch (err) {
    logger.warn(`[training] incrementJoinCount failed: ${(err as Error).message}`)
  }
  cache.delete(byIdKey(trainingId))
}

export async function incrementViewCount(trainingId: string) {
  try {
    await prisma.training.update({
      where: { id: trainingId },
      data: { viewCount: { increment: 1 } },
    })
  } catch (err) {
    logger.warn(`[training] incrementViewCount failed: ${(err as Error).message}`)
  }
  // view count 不清除详情缓存以避免抖动
}

/* ============================================================================
 * 详情 + 用户进度
 * ========================================================================== */

function statusFromSubmission(status: string): TrainingProblemStatus {
  if (status === 'AC') return 'AC'
  return 'ATTEMPTED'
}

export async function getTrainingWithProblemStatuses(
  id: string,
  userId: string | null
): Promise<TrainingDetail | null> {
  const training = await prisma.training.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, nickname: true, avatar: true } },
      category: { select: { id: true, name: true } },
      problems: {
        orderBy: { orderIndex: 'asc' },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              tags: true,
              totalSubmit: true,
              totalAccepted: true,
              problemNumber: true,
            },
          },
        },
      },
    },
  })
  if (!training) return null

  const problemStatuses: Record<string, { status: TrainingProblemStatus; lastStatus: string | null; submittedAt: Date | null }> = {}
  let isJoined = false
  if (userId) {
    const enrollment = await prisma.trainingEnrollment.findUnique({
      where: { trainingId_userId: { trainingId: id, userId } },
      select: { id: true },
    })
    isJoined = !!enrollment

    const problemIds = training.problems.map((p: any) => p.problemId)
    if (problemIds.length > 0) {
      const submissions = await prisma.submission.findMany({
        where: { userId, problemId: { in: problemIds } },
        select: { problemId: true, status: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
      })
      for (const sub of submissions) {
        if (problemStatuses[sub.problemId]) continue
        problemStatuses[sub.problemId] = {
          status: statusFromSubmission(sub.status),
          lastStatus: sub.status,
          submittedAt: sub.submittedAt,
        }
      }
    }
  }

  const problems: TrainingProblemItem[] = training.problems.map((p: any) => {
    const st = problemStatuses[p.problemId]
    return {
      id: p.id,
      problemId: p.problemId,
      orderIndex: p.orderIndex,
      score: p.score,
      required: p.required,
      problem: p.problem,
      status: st?.status ?? 'NOT_STARTED',
      lastSubmissionStatus: st?.lastStatus ?? null,
      submittedAt: st?.submittedAt ?? null,
    }
  })

  const totalProblems = problems.length
  const solvedCount = problems.filter((p: any) => p.status === 'AC').length
  const attemptedCount = problems.filter((p: any) => p.status === 'AC' || p.status === 'ATTEMPTED').length

  return {
    id: training.id,
    title: training.title,
    description: training.description,
    difficulty: training.difficulty,
    categoryType: (training.categoryType as TrainingCategoryType | null) ?? null,
    isPublic: training.isPublic,
    status: training.status,
    isRecommended: training.isRecommended,
    tags: training.tags || [],
    cover: training.cover,
    joinCount: training.joinCount,
    viewCount: training.viewCount,
    createdAt: training.createdAt,
    updatedAt: training.updatedAt,
    author: training.author,
    category: training.category,
    problems,
    isJoined,
    userProgress: {
      totalProblems,
      solvedCount,
      attemptedCount,
      progressPercentage: totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0,
    },
  }
}

export async function getTrainingProblems(trainingId: string, userId: string | null) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { id: true, title: true },
  })
  if (!training) return null

  const trainingProblems = await prisma.trainingProblem.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          tags: true,
          totalSubmit: true,
          totalAccepted: true,
        },
      },
    },
  })

  const problemStatuses: Record<string, TrainingProblemStatus> = {}
  if (userId) {
    const problemIds = trainingProblems.map((p: any) => p.problemId)
    if (problemIds.length > 0) {
      const submissions = await prisma.submission.findMany({
        where: { userId, problemId: { in: problemIds } },
        select: { problemId: true, status: true },
        orderBy: { submittedAt: 'desc' },
      })
      for (const sub of submissions) {
        if (problemStatuses[sub.problemId]) continue
        problemStatuses[sub.problemId] = statusFromSubmission(sub.status)
      }
    }
  }

  const problems = trainingProblems.map((tp: any) => ({
    ...tp.problem,
    orderIndex: tp.orderIndex,
    score: tp.score,
    required: tp.required,
    status: problemStatuses[tp.problemId] ?? 'NOT_STARTED',
  }))

  return { training, problems }
}

/** 题单做题页：A/B/C 编号 + 通过/尝试状态（对齐竞赛题目列表） */
export async function listTrainingProblemsWithStatus(
  trainingId: string,
  userId: string | null
) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { id: true, title: true, status: true, isPublic: true, authorId: true },
  })
  if (!training) return null

  const trainingProblems = await prisma.trainingProblem.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          problemNumber: true,
          difficulty: true,
        },
      },
    },
  })

  const problemIds = trainingProblems.map((tp) => tp.problemId)
  const userSubmissionStatus: Record<string, 'Accepted' | 'Attempted' | null> = {}

  if (userId && problemIds.length > 0) {
    const submissions = await prisma.submission.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true, status: true },
      orderBy: { submittedAt: 'desc' },
    })
    const map = new Map<string, Set<string>>()
    for (const sub of submissions) {
      if (!map.has(sub.problemId)) map.set(sub.problemId, new Set())
      map.get(sub.problemId)!.add(sub.status)
    }
    for (const pid of problemIds) {
      const statuses = map.get(pid)
      if (statuses?.has('Accepted') || statuses?.has('AC')) {
        userSubmissionStatus[pid] = 'Accepted'
      } else if (statuses && statuses.size > 0) {
        userSubmissionStatus[pid] = 'Attempted'
      } else {
        userSubmissionStatus[pid] = null
      }
    }
  }

  const problems = trainingProblems.map((tp) => ({
    id: tp.problemId,
    orderIndex: tp.orderIndex,
    label: String.fromCharCode(65 + tp.orderIndex),
    title: tp.problem.title,
    problemNumber: tp.problem.problemNumber,
    difficulty: tp.problem.difficulty,
    status: userId ? userSubmissionStatus[tp.problemId] ?? null : null,
  }))

  return {
    training: { id: training.id, title: training.title },
    problems,
  }
}

export async function getUserTrainingProgressDetail(
  trainingId: string,
  userId: string
): Promise<UserTrainingProgress | null> {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { problems: { select: { problemId: true } } },
  })
  if (!training) return null

  const problemIds = training.problems.map((p: any) => p.problemId)
  const totalProblems = problemIds.length

  const submissions = problemIds.length > 0 ? await prisma.submission.findMany({
    where: { userId, problemId: { in: problemIds } },
    select: { problemId: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  }) : []

  const problemStatusMap = new Map<string, { status: string; submittedAt: Date }>()
  for (const sub of submissions) {
    if (!problemStatusMap.has(sub.problemId)) {
      problemStatusMap.set(sub.problemId, { status: sub.status, submittedAt: sub.submittedAt })
    }
  }

  let solvedCount = 0
  let attemptedCount = 0
  const problemProgress: UserTrainingProgress['problemProgress'] = []

  for (const problemId of problemIds) {
    const statusData = problemStatusMap.get(problemId)
    if (statusData) {
      attemptedCount++
      if (statusData.status === 'AC') {
        solvedCount++
        problemProgress.push({ problemId, status: 'AC', submittedAt: statusData.submittedAt })
      } else {
        problemProgress.push({ problemId, status: statusData.status, submittedAt: statusData.submittedAt })
      }
    } else {
      problemProgress.push({ problemId, status: 'NOT_STARTED', submittedAt: null })
    }
  }

  const recentSubmissions = problemIds.length > 0 ? await prisma.submission.findMany({
    where: { userId, problemId: { in: problemIds } },
    orderBy: { submittedAt: 'desc' },
    take: 5,
    select: { id: true, problemId: true, status: true, language: true, submittedAt: true },
  }) : []

  return {
    training: { id: training.id, title: training.title },
    progress: {
      totalProblems,
      solvedCount,
      attemptedCount,
      progressPercentage: totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0,
    },
    problemProgress,
    recentSubmissions: recentSubmissions.map((s: any) => ({
      id: s.id,
      problemId: s.problemId,
      status: s.status,
      language: s.language,
      submittedAt: s.submittedAt,
    })),
  }
}

