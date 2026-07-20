/**
 * lib/class/assignment-submit.ts
 * 班级作业：代码提交（写操作 + 评测入队）
 */

import { prisma } from '@/lib/prisma'
import { addJudgeJob } from '@/lib/judge/queue'
import { logger } from '@/lib/logger'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import {
  createClassAssignmentSubmissionDirect,
  createSubmissionDirect,
  deleteClassAssignmentSubmissionDirect,
  incrementProblemSubmitCount,
} from '@/lib/mongodb-direct'
import { ApiError } from '@/lib/api/withApi'
import { getAssignmentStatus } from './assignment-stats'

/** 提交班级作业代码（写入评测队列） */
export interface SubmitAssignmentInput {
  classId: string
  assignmentId: string
  userId: string
  problemId: string
  code: string
  language: string
}

// 与 /api/submissions 路由保持一致的语言白名单
const ASSIGNMENT_ALLOWED_LANGUAGES = ['cpp', 'c', 'python']

// 同一用户对同一题目的最小提交间隔（毫秒），防止刷屏
const SUBMIT_RATE_LIMIT_MS = 10_000

export async function submitAssignmentCode(input: SubmitAssignmentInput) {
  // 前置输入校验
  if (!ASSIGNMENT_ALLOWED_LANGUAGES.includes(input.language)) {
    throw new ApiError('INVALID_LANGUAGE', '不支持的语言', 400)
  }
  const codeLen = input.code?.length ?? 0
  if (codeLen < 10) {
    throw new ApiError('CODE_TOO_SHORT', '代码长度不能少于 10 个字符', 400)
  }
  if (codeLen > 50_000) {
    throw new ApiError('CODE_TOO_LONG', '代码长度不能超过 50000 个字符', 400)
  }

  const assignment = await prisma.classAssignment.findUnique({
    where: { id: input.assignmentId, classId: input.classId },
  })
  if (!assignment) return { ok: false, code: 404, reason: '作业不存在' as const }

  if (!assignment.problemIds.includes(input.problemId)) {
    return { ok: false, code: 400, reason: '该题目不在当前作业中' as const }
  }

  // 作业状态校验：upcoming 拒绝提交；ended 根据 allowLateSubmission 判定
  const status = getAssignmentStatus(assignment.startTime, assignment.endTime)
  if (status === 'upcoming') {
    throw new ApiError('ASSIGNMENT_NOT_STARTED', '作业尚未开始，无法提交', 403)
  }

  const deadline = assignment.endTime ? new Date(assignment.endTime) : null
  const now = new Date()
  let isLate = deadline ? now > deadline : false

  if (status === 'ended') {
    if (!assignment.allowLateSubmission) {
      throw new ApiError('ASSIGNMENT_ENDED', '作业已结束，不接受新提交', 403)
    }
    // 允许逾期提交：强制 isLate = true（即使 endTime 刚过）
    isLate = true
  }

  // 频率限制：查最近一次该用户+该题目的提交时间，10 秒内拒绝重复提交
  const recentSubmission = await prisma.classAssignmentSubmission.findFirst({
    where: {
      assignmentId: input.assignmentId,
      problemId: input.problemId,
      userId: input.userId,
    },
    orderBy: { submittedAt: 'desc' },
    select: { submittedAt: true },
  })
  if (recentSubmission) {
    const elapsed = now.getTime() - new Date(recentSubmission.submittedAt).getTime()
    if (elapsed < SUBMIT_RATE_LIMIT_MS) {
      const waitSec = Math.ceil((SUBMIT_RATE_LIMIT_MS - elapsed) / 1000)
      throw new ApiError(
        'SUBMIT_TOO_FREQUENT',
        `提交过于频繁，请 ${waitSec} 秒后重试`,
        429
      )
    }
  }

  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!problem) return { ok: false, code: 404, reason: '题目不存在' as const }
  if (!problem.testCases || problem.testCases.length === 0) {
    return { ok: false, code: 400, reason: '题目没有测试用例，无法评测' as const }
  }

  const assignmentSubmission = await createClassAssignmentSubmissionDirect({
    assignmentId: input.assignmentId,
    userId: input.userId,
    problemId: input.problemId,
    code: input.code,
    language: input.language,
    status: SubmissionStatus.PENDING,
    totalTests: problem.testCases.length,
    isLate,
  })

  // 两次写入使用原生驱动（非 Prisma），用补偿逻辑保证一致性：
  // 第二步 createSubmissionDirect 失败时回滚第一步，避免孤立作业提交记录
  let submission
  try {
    submission = await createSubmissionDirect({
      problemId: input.problemId,
      userId: input.userId,
      code: input.code,
      language: input.language,
      status: SubmissionStatus.PENDING,
      totalTests: problem.testCases.length,
      assignmentSubmissionId: assignmentSubmission.id,
    })
  } catch (err) {
    await deleteClassAssignmentSubmissionDirect(assignmentSubmission.id).catch(() => {})
    throw err
  }

  await incrementProblemSubmitCount(input.problemId)

  try {
    await addJudgeJob({
      submissionId: submission.id,
      problemId: input.problemId,
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
  } catch (err) {
    logger.error(
      '加入评测队列失败，回滚提交记录与计数',
      err instanceof Error ? err : new Error(String(err))
    )
    // L-3 修复：事务回滚 - 删除 submission + 计数减一，避免 Problem.totalSubmit 虚高
    try {
      await prisma.$transaction([
        prisma.submission.delete({ where: { id: submission.id } }),
        prisma.problem.update({
          where: { id: problem.id },
          data: { totalSubmit: { decrement: 1 } },
        }),
        prisma.classAssignmentSubmission.update({
          where: { id: assignmentSubmission.id },
          data: {
            status: SubmissionStatus.SYSTEM_ERROR,
            message: '评测系统错误，请稍后重试',
          },
        }),
      ])
    } catch (rollbackError) {
      logger.error(
        `提交回滚失败 (submissionId=${submission.id}, problemId=${problem.id})`,
        rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
      )
    }
    throw new ApiError('JUDGE_QUEUE_FAILED', '评测系统错误，请稍后重试', 503)
  }

  return {
    ok: true as const,
    submissionId: submission.id,
    submission,
    isLate,
  }
}
