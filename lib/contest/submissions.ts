/**
 * lib/contest/submissions.ts
 * 竞赛提交列表 + 代码提交入队评测
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import {
  createSubmissionDirect,
  incrementProblemSubmitCount,
} from '@/lib/mongodb-direct'
import { addJudgeJob } from '@/lib/judge/queue'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import { CacheKeys } from '@/lib/constants/cache-keys'

/* ============================================================================
 * 竞赛提交列表（含 user/problem 关联）
 * ========================================================================== */

export interface ListContestSubmissionsFilter {
  page?: number
  limit?: number
  userId?: string
  problemId?: string
}

export async function listContestSubmissionsPaged(
  contestId: string,
  filter: ListContestSubmissionsFilter = {}
) {
  const page = filter.page ?? 1
  const limit = filter.limit ?? 20
  const where: any = { contestId }
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { submittedAt: 'desc' },
      // SEC-03: 使用 select 显式列出字段，排除 code 字段，避免代码泄露
      select: {
        id: true,
        problemId: true,
        userId: true,
        language: true,
        status: true,
        score: true,
        time: true,
        memory: true,
        passedTests: true,
        totalTests: true,
        message: true,
        submittedAt: true,
        user: { select: { id: true, username: true, nickname: true } },
        problem: { select: { id: true, title: true, problemNumber: true } },
      },
    }),
    prisma.submission.count({ where }),
  ])

  return {
    submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/* ============================================================================
 * 竞赛代码提交：入队评测（原 /api/contests/[id]/submissions POST）
 * ========================================================================== */

export interface SubmitContestCodeInput {
  contestId: string
  userId: string
  isAdmin: boolean
  problemId: string
  code: string
  language: string
}

export async function submitContestCode(input: SubmitContestCodeInput) {
  if (!input.problemId || !input.code || !input.language) {
    throw new ApiError('MISSING_FIELDS', '缺少必需字段: problemId, code, language', 400)
  }
  const contest = await prisma.contest.findUnique({ where: { id: input.contestId } })
  if (!contest) {
    throw new ApiError('NOT_FOUND', '竞赛不存在', 404)
  }

  const now = new Date()
  // 管理员可以随时提交（用于测试），普通用户需在比赛期间提交
  if (!input.isAdmin) {
    if (now < contest.startTime) throw new ApiError('FORBIDDEN', '竞赛尚未开始', 403)
    if (now > contest.endTime) throw new ApiError('FORBIDDEN', '竞赛已结束', 403)

    // 验证用户是否报名
    const participant = await prisma.contestParticipant.findFirst({
      where: { contestId: input.contestId, userId: input.userId },
    })
    if (!participant) {
      throw new ApiError('FORBIDDEN', '未报名该竞赛，无法提交', 403)
    }
  }

  // 验证题目是否属于该竞赛
  // input.problemId 可能是真实 problemId，也可能是 contestProblem 的 id 或者 orderIndex
  // 假设前端传的是真实 problemId
  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId: input.contestId, problemId: input.problemId },
    include: { problem: { include: { testCases: true } } },
  })
  if (!contestProblem) {
    throw new ApiError('PROBLEM_NOT_IN_CONTEST', '该题目不属于当前竞赛', 400)
  }
  const problem = contestProblem.problem

  // 4. 创建提交记录
  const submission = await createSubmissionDirect({
    problemId: problem.id,
    userId: input.userId,
    contestId: input.contestId,
    language: input.language,
    code: input.code,
    status: SubmissionStatus.PENDING,
    totalTests: problem.testCases.length,
  })

  // 更新题目总提交数
  await incrementProblemSubmitCount(problem.id)

  // 5. 加入评测队列；失败时事务回滚（删除 submission + 计数减一）
  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: problem.id,
      userId: input.userId,
      code: input.code,
      language: input.language,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: problem.comparisonMode as any,
      realPrecision: problem.realPrecision,
      testCases: problem.testCases.map((tc: any) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        score: tc.score,
        timeLimit: tc.timeLimit ?? undefined,
        memoryLimit: tc.memoryLimit ?? undefined,
      })),
    })
    logger.info(`竞赛提交 ${submission.id} 已加入评测队列`)
  } catch (queueError) {
    logger.error('加入评测队列失败，回滚提交记录与计数', queueError instanceof Error ? queueError : new Error(String(queueError)))
    // L-3 修复：事务回滚 - 删除提交记录 + 计数减一，避免 Problem.totalSubmit 虚高
    try {
      await prisma.$transaction([
        prisma.submission.delete({ where: { id: submission.id } }),
        prisma.problem.update({
          where: { id: problem.id },
          data: { totalSubmit: { decrement: 1 } },
        }),
      ])
    } catch (rollbackError) {
      logger.error(
        `提交回滚失败 (submissionId=${submission.id}, problemId=${problem.id})，可能存在计数不一致`,
        rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
      )
    }
    throw new ApiError('JUDGE_QUEUE_FAILED', '评测系统错误，请稍后重试', 503)
  }

  // 提交后失效该竞赛的排行榜缓存（不同 limit 的缓存都要清）
  cache.deleteByPrefix(CacheKeys.contest.rankPrefix(input.contestId))

  return {
    submissionId: submission.id,
    submission,
    message: '代码已提交，正在评测中...',
  }
}
