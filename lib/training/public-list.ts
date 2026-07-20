/**
 * lib/training/public-list.ts
 * 公开训练列表高级查询（带分类/标签/作者/题目计数/用户进度）
 */
import { prisma } from '@/lib/prisma'
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
