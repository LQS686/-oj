/**
 * lib/training/progress.ts
 * 训练详情 + 用户进度
 */
import { prisma } from '@/lib/prisma'
import type {
  TrainingCategoryType,
  TrainingDetail,
  TrainingProblemItem,
  UserTrainingProgress,
  TrainingProblemStatus,
} from './types'

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
