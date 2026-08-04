/**
 * lib/training/progress.ts
 * 训练详情 + 用户进度
 */
import { prisma } from '@/lib/prisma'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
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

/** 0→A … 25→Z，26→AA（Excel 风格） */
function orderIndexToLabel(orderIndex: number): string {
  let n = Math.max(0, orderIndex) + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
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

    const problemIds = training.problems.map((p) => p.problemId)
    if (problemIds.length > 0) {
      const submissions = await prisma.submission.findMany({
        where: { userId, problemId: { in: problemIds } },
        select: { problemId: true, status: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
      })
      // 与 listTrainingProblemsWithStatus 一致：任意历史 AC 即视为通过
      const byProblem = new Map<string, { statuses: Set<string>; lastStatus: string; submittedAt: Date }>()
      for (const sub of submissions) {
        let entry = byProblem.get(sub.problemId)
        if (!entry) {
          entry = { statuses: new Set(), lastStatus: sub.status, submittedAt: sub.submittedAt }
          byProblem.set(sub.problemId, entry)
        }
        entry.statuses.add(sub.status)
      }
      for (const [pid, entry] of byProblem) {
        const preferred = entry.statuses.has(SubmissionStatus.ACCEPTED)
          ? SubmissionStatus.ACCEPTED
          : entry.lastStatus
        problemStatuses[pid] = {
          status: statusFromSubmission(preferred),
          lastStatus: preferred,
          submittedAt: entry.submittedAt,
        }
      }
    }
  }

  const problems: TrainingProblemItem[] = training.problems.map((p) => {
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
  const solvedCount = problems.filter((p) => p.status === 'AC').length
  const attemptedCount = problems.filter((p) => p.status === 'AC' || p.status === 'ATTEMPTED').length

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
    author: training.author
      ? { ...training.author, avatar: sanitizeAvatarUrl(training.author.avatar) }
      : training.author,
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
    const problemIds = trainingProblems.map((p) => p.problemId)
    if (problemIds.length > 0) {
      const submissions = await prisma.submission.findMany({
        where: { userId, problemId: { in: problemIds } },
        select: { problemId: true, status: true },
        orderBy: { submittedAt: 'desc' },
      })
      const statusesByProblem = new Map<string, Set<string>>()
      for (const sub of submissions) {
        if (!statusesByProblem.has(sub.problemId)) {
          statusesByProblem.set(sub.problemId, new Set())
        }
        statusesByProblem.get(sub.problemId)!.add(sub.status)
      }
      for (const [pid, statuses] of statusesByProblem) {
        problemStatuses[pid] = statuses.has(SubmissionStatus.ACCEPTED)
          ? 'AC'
          : 'ATTEMPTED'
      }
    }
  }

  const problems = trainingProblems.map((tp) => ({
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
  // 状态枚举统一大写（与详情页 getTrainingProblemStatus 的 'ATTEMPTED' 一致）
  const userSubmissionStatus: Record<string, 'AC' | 'ATTEMPTED' | null> = {}

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
      if (statuses?.has(SubmissionStatus.ACCEPTED)) {
        userSubmissionStatus[pid] = 'AC'
      } else if (statuses && statuses.size > 0) {
        userSubmissionStatus[pid] = 'ATTEMPTED'
      } else {
        userSubmissionStatus[pid] = null
      }
    }
  }

  const problems = trainingProblems.map((tp) => ({
    id: tp.problemId,
    orderIndex: tp.orderIndex,
    label: orderIndexToLabel(tp.orderIndex),
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

  const problemIds = training.problems.map((p) => p.problemId)
  const totalProblems = problemIds.length

  const submissions = problemIds.length > 0 ? await prisma.submission.findMany({
    where: { userId, problemId: { in: problemIds } },
    select: { problemId: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  }) : []

  const problemStatusMap = new Map<string, { status: string; submittedAt: Date }>()
  for (const sub of submissions) {
    const existing = problemStatusMap.get(sub.problemId)
    if (!existing) {
      problemStatusMap.set(sub.problemId, {
        status: sub.status,
        submittedAt: sub.submittedAt,
      })
    } else if (sub.status === SubmissionStatus.ACCEPTED && existing.status !== SubmissionStatus.ACCEPTED) {
      existing.status = sub.status
      existing.submittedAt = sub.submittedAt
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
    recentSubmissions: recentSubmissions.map((s) => ({
      id: s.id,
      problemId: s.problemId,
      status: s.status,
      language: s.language,
      submittedAt: s.submittedAt,
    })),
  }
}
