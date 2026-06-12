/**
 * lib/training/service.ts
 * 训练计划 CRUD + 进度
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import type { Prisma } from '@prisma/client'

export interface TrainingFilter {
  keyword?: string
  isPublic?: boolean
  categoryId?: string
}

export async function listTrainings(
  filter: TrainingFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
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
  }, { ttl: 30_000 })
}

export async function createTraining(data: any) {
  return prisma.training.create({ data })
}

export async function updateTraining(id: string, data: any) {
  cache.delete(`training:byId:${id}`)
  return prisma.training.update({ where: { id }, data })
}

export async function deleteTraining(id: string) {
  cache.delete(`training:byId:${id}`)
  return prisma.training.delete({ where: { id } })
}

export async function getUserTrainingProgress(trainingId: string, userId: string) {
  return (prisma as any).trainingProgress
    ? await (prisma as any).trainingProgress.findUnique({
        where: { trainingId_userId: { trainingId, userId } },
      })
    : null
}

export async function updateTrainingProgress(
  trainingId: string,
  userId: string,
  data: { completedProblems?: number; totalScore?: number }
) {
  const model = (prisma as any).trainingProgress
  if (!model) return null
  return model.upsert({
    where: { trainingId_userId: { trainingId, userId } },
    update: data,
    create: { trainingId, userId, ...data },
  })
}

/* ============================================================================
 * 业务封装：原 /api/trainings 路由中的复杂逻辑
 * ========================================================================== */

/**
 * 训练计划列表（公开 + 关键字 + 难度 + 题目计数）
 */
export async function listPublicTrainingsAdvanced(
  page: number,
  limit: number,
  filter: { keyword?: string; difficulty?: string }
) {
  const where: Prisma.TrainingWhereInput = { isPublic: true }
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
      { description: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty

  const [trainings, total] = await Promise.all([
    prisma.training.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { problems: true } } },
    }),
    prisma.training.count({ where }),
  ])
  return {
    items: trainings.map(t => ({ ...t, problemCount: t._count.problems })),
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * 创建训练计划 + 批量绑定题目
 */
export interface CreateTrainingInput {
  title: string
  description: string
  difficulty: string
  isPublic?: boolean
  problemIds?: string[]
}

export async function createTrainingWithProblems(input: CreateTrainingInput) {
  const training = await prisma.training.create({
    data: {
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      isPublic: input.isPublic ?? true,
    },
  })
  if (input.problemIds && input.problemIds.length > 0) {
    const trainingProblems = input.problemIds.map((problemId, index) => ({
      trainingId: training.id,
      problemId,
      orderIndex: index,
    }))
    await prisma.trainingProblem.createMany({ data: trainingProblems })
  }
  return training
}

/**
 * 训练详情 + 当前用户题目状态
 */
export async function getTrainingWithProblemStatuses(id: string, userId: string | null) {
  const training = await prisma.training.findUnique({
    where: { id },
    include: {
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
            },
          },
        },
      },
    },
  })
  if (!training) return null

  let problemStatuses: Record<string, { submitted: boolean; accepted: boolean }> = {}
  if (userId) {
    const problemIds = training.problems.map(p => p.problemId)
    const submissions = await prisma.submission.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true, status: true },
    })
    const problemStatusMap = new Map<string, { submitted: boolean; accepted: boolean }>()
    for (const sub of submissions) {
      const existing = problemStatusMap.get(sub.problemId) || { submitted: false, accepted: false }
      if (sub.status === 'AC') {
        problemStatusMap.set(sub.problemId, { submitted: true, accepted: true })
      } else if (!existing.submitted) {
        problemStatusMap.set(sub.problemId, { submitted: true, accepted: false })
      }
    }
    problemStatuses = Object.fromEntries(problemStatusMap)
  }

  return {
    ...training,
    problems: training.problems.map(p => ({
      ...p.problem,
      orderIndex: p.orderIndex,
      submitted: problemStatuses[p.problemId]?.submitted ?? false,
      accepted: problemStatuses[p.problemId]?.accepted ?? false,
    })),
  }
}

/**
 * 训练题目列表（轻量）
 */
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

  let problemStatuses: Record<string, { submitted: boolean; accepted: boolean }> = {}
  if (userId) {
    const problemIds = trainingProblems.map(p => p.problemId)
    const submissions = await prisma.submission.findMany({
      where: { userId, problemId: { in: problemIds } },
      select: { problemId: true, status: true },
    })
    const problemStatusMap = new Map<string, { submitted: boolean; accepted: boolean }>()
    for (const sub of submissions) {
      const existing = problemStatusMap.get(sub.problemId) || { submitted: false, accepted: false }
      if (sub.status === 'AC') {
        problemStatusMap.set(sub.problemId, { submitted: true, accepted: true })
      } else if (!existing.submitted) {
        problemStatusMap.set(sub.problemId, { submitted: true, accepted: false })
      }
    }
    problemStatuses = Object.fromEntries(problemStatusMap)
  }

  const problems = trainingProblems.map(tp => ({
    ...tp.problem,
    orderIndex: tp.orderIndex,
    submitted: problemStatuses[tp.problemId]?.submitted ?? false,
    accepted: problemStatuses[tp.problemId]?.accepted ?? false,
  }))

  return { training, problems }
}

/**
 * 用户在某个训练下的进度（AC/Attempted/百分比 + 最近 5 条提交）
 */
export async function getUserTrainingProgressDetail(trainingId: string, userId: string) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { problems: { select: { problemId: true } } },
  })
  if (!training) return null

  const problemIds = training.problems.map(p => p.problemId)
  const totalProblems = problemIds.length

  const submissions = await prisma.submission.findMany({
    where: { userId, problemId: { in: problemIds } },
    select: { problemId: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  })

  const problemStatusMap = new Map<string, { status: string; submittedAt: Date }>()
  for (const sub of submissions) {
    if (!problemStatusMap.has(sub.problemId)) {
      problemStatusMap.set(sub.problemId, { status: sub.status, submittedAt: sub.submittedAt })
    }
  }

  let solvedCount = 0
  let attemptedCount = 0
  const problemProgress: Array<{ problemId: string; status: string; submittedAt: Date | null }> = []

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

  const progressPercentage = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0

  const recentSubmissions = await prisma.submission.findMany({
    where: { userId, problemId: { in: problemIds } },
    orderBy: { submittedAt: 'desc' },
    take: 5,
    select: { id: true, problemId: true, status: true, language: true, submittedAt: true },
  })

  return {
    training: { id: training.id, title: training.title },
    progress: { totalProblems, solvedCount, attemptedCount, progressPercentage },
    problemProgress,
    recentSubmissions: recentSubmissions.map(s => ({
      id: s.id,
      problemId: s.problemId,
      status: s.status,
      language: s.language,
      submittedAt: s.submittedAt,
    })),
  }
}
