/**
 * lib/training/public-list.ts
 * 公开训练列表高级查询（带分类/标签/作者/题目计数/用户进度）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
import type {
  TrainingListItem,
  PaginatedResponse,
  TrainingCategoryType,
} from './types'

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
  // 公开题单：isPublic + published；登录用户额外可看到自己创建的私有/草稿
  const visibility: Prisma.TrainingWhereInput = filter.userId
    ? {
        OR: [
          { isPublic: true, status: 'published' },
          { authorId: filter.userId },
        ],
      }
    : { isPublic: true, status: 'published' }

  const baseScope: Prisma.TrainingWhereInput = { ...visibility }

  // joinedOnly：限定为当前用户加入的题单；未登录时返回空集
  if (filter.joinedOnly) {
    if (!filter.userId) {
      return {
        items: [],
        total: 0,
        page,
        pageSize: limit,
        totalPages: 0,
      }
    }
    const joinedIds = await prisma.trainingEnrollment.findMany({
      where: { userId: filter.userId },
      select: { trainingId: true },
    })
    const joinedTrainingIds = joinedIds.map((e: { trainingId: string }) => e.trainingId)
    baseScope.id = { in: joinedTrainingIds }
  }
  const extra: Prisma.TrainingWhereInput[] = []
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
      OR: [
        { categoryType: 'official' },
        { categoryType: null },
        { categoryType: { isSet: false } },
      ],
    })
  } else if (filter.categoryType === 'contest') {
    extra.push({ categoryType: 'contest' })
  }
  if (filter.isRecommended === true) {
    extra.push({ isRecommended: true })
  }
  const where: Prisma.TrainingWhereInput =
    extra.length > 0 ? { AND: [baseScope, ...extra] } : baseScope

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
  const progressMap = new Map<
    string,
    { solvedCount: number; attemptedCount: number; isJoined: boolean }
  >()
  if (filter.userId && trainings.length > 0) {
    const trainingIds = trainings.map((t: { id: string }) => t.id)
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { userId: filter.userId, trainingId: { in: trainingIds } },
      select: { trainingId: true },
    })
    const enrolledSet = new Set(enrollments.map((e: { trainingId: string }) => e.trainingId))

    const allProblems = await prisma.trainingProblem.findMany({
      where: { trainingId: { in: trainingIds } },
      select: { id: true, trainingId: true, problemId: true },
    })
    const problemIds = [...new Set(allProblems.map((p: { problemId: string }) => p.problemId))]
    const submissions =
      problemIds.length > 0
        ? await prisma.submission.findMany({
            where: { userId: filter.userId, problemId: { in: problemIds } },
            select: { problemId: true, status: true },
          })
        : []
    const acSet = new Set(
      submissions.filter((s: { status: string }) => s.status === 'AC').map((s: { problemId: string }) => s.problemId)
    )
    const attSet = new Set(submissions.map((s: { problemId: string }) => s.problemId))

    for (const t of trainings) {
      const tProblems = allProblems.filter((p: { trainingId: string }) => p.trainingId === t.id)
      const solvedCount = tProblems.filter((p: { problemId: string }) => acSet.has(p.problemId)).length
      const attemptedCount = tProblems.filter((p: { problemId: string }) => attSet.has(p.problemId)).length
      progressMap.set(t.id, {
        solvedCount,
        attemptedCount,
        isJoined: enrolledSet.has(t.id),
      })
    }
  }

  const items: TrainingListItem[] = trainings.map((t) => {
    const p = progressMap.get(t.id)
    const problemTotal = t._count.problems
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
      problemCount: problemTotal,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      author: t.author
        ? { ...t.author, avatar: sanitizeAvatarUrl(t.author.avatar) }
        : t.author,
      category: t.category,
      userProgress: p
        ? {
            solvedCount: p.solvedCount,
            attemptedCount: p.attemptedCount,
            progressPercentage:
              problemTotal > 0 ? Math.round((p.solvedCount / problemTotal) * 100) : 0,
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
