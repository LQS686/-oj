/**
 * lib/training/class-training.ts
 * 班级私有题单 + 权限检查
 */
import { prisma } from '@/lib/prisma'
import type {
  TrainingListItem,
  PaginatedResponse,
  TrainingCategoryType,
} from './types'

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
