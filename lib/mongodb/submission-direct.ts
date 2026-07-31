/**
 * Submission 相关直操作（绕过 Prisma 事务）
 *
 * 包含 Submission 表的创建/更新、Problem 表的提交数/通过数自增、首次 AC 判定。
 */

import { ObjectId } from 'mongodb'
import {
  SubmissionStatus,
  canTransition as canSubmissionTransition,
} from '@/lib/constants/submission-status'
import { getMongoClient, withRetry } from './client'
import { errorLike } from '@/lib/api/errors'

/**
 * 直接创建提交记录（绕过 Prisma 事务）
 */
export async function createSubmissionDirect(data: {
  problemId: string
  userId: string
  contestId?: string
  language: string
  code: string
  status: string
  totalTests: number
  assignmentSubmissionId?: string
}) {
  // _id 在重试闭包外生成：非幂等 insert 默认不重试；若上层显式重试也不会产生多份副本
  const _id = new ObjectId()
  const client = await getMongoClient()
  const db = client.db()

  const submission = {
    _id,
    problemId: new ObjectId(data.problemId),
    userId: new ObjectId(data.userId),
    contestId: data.contestId ? new ObjectId(data.contestId) : null,
    language: data.language,
    code: data.code,
    status: data.status,
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: data.totalTests,
    message: null,
    submittedAt: new Date(),
    testResults: null,
    assignmentSubmissionId: data.assignmentSubmissionId
      ? new ObjectId(data.assignmentSubmissionId)
      : null,
  }

  try {
    await db.collection('Submission').insertOne(submission)
  } catch (error: unknown) {
    // 同 _id 的 DuplicateKey：上次已写入但 ack 丢失，视为成功
    const e = errorLike(error)
    if (Number(e.code) !== 11000) throw error
  }

  return {
    id: submission._id.toString(),
    ...submission,
    problemId: submission.problemId.toString(),
    userId: submission.userId.toString(),
    contestId: submission.contestId?.toString(),
    assignmentSubmissionId: submission.assignmentSubmissionId?.toString(),
  }
}

/**
 * 直接更新题目提交数（绕过 Prisma 事务）
 */
export async function incrementProblemSubmitCount(problemId: string) {
  // $inc 非幂等：禁止 withRetry，避免网络重试双计
  const client = await getMongoClient()
  const db = client.db()
  await db.collection('Problem').updateOne(
    { _id: new ObjectId(problemId) },
    { $inc: { totalSubmit: 1 } }
  )
}

/** 入队失败等回滚路径：递减题目总提交数（不低于 0） */
export async function decrementProblemSubmitCount(problemId: string) {
  const client = await getMongoClient()
  const db = client.db()
  await db.collection('Problem').updateOne(
    { _id: new ObjectId(problemId), totalSubmit: { $gt: 0 } },
    { $inc: { totalSubmit: -1 } }
  )
}

export type UpdateSubmissionDirectResult = {
  matched: boolean
  modified: boolean
}

/**
 * 直接更新提交记录（绕过 Prisma 事务）
 *
 * @param options.onlyFromStatuses 原子条件：仅当当前 status ∈ 集合时更新。
 *   用于 active→JUDGING 与 completed→终态竞态，避免慢一步的 JUDGING 覆盖终态。
 */
export async function updateSubmissionDirect(
  submissionId: string,
  data: {
    status?: string
    score?: number
    time?: number
    memory?: number
    passedTests?: number
    totalTests?: number
    message?: string | null
    testResults?: unknown
  },
  options?: { forceStatus?: boolean; onlyFromStatuses?: string[] }
): Promise<UpdateSubmissionDirectResult> {
  return withRetry(
    async () => {
    const client = await getMongoClient()
    const db = client.db()

    const sanitized: Record<string, unknown> = {}
    const allowedFields = [
      'status',
      'score',
      'time',
      'memory',
      'passedTests',
      'totalTests',
      'message',
      'testResults',
    ]
    for (const key of allowedFields) {
      if (key in data && data[key as keyof typeof data] !== undefined) {
        sanitized[key] = data[key as keyof typeof data]
      }
    }

    const filter: Record<string, unknown> = { _id: new ObjectId(submissionId) }
    if (options?.onlyFromStatuses && options.onlyFromStatuses.length > 0) {
      filter.status = { $in: options.onlyFromStatuses }
    }

    // 状态机守卫（仅在非条件更新路径做读-改；onlyFromStatuses 已原子约束源状态）：
    //   1) 若要更新 status，先读当前状态
    //   2) 通过 canTransition 校验合法转换
    //   3) 仅在 PENDING/JUDGING/RUNNING 下允许非合法转换（recover / 竞态）
    //   4) forceStatus：管理员重测，允许终态 → PENDING
    if (
      typeof sanitized.status === 'string' &&
      !options?.forceStatus &&
      !options?.onlyFromStatuses?.length
    ) {
      const current = await db.collection('Submission').findOne(
        { _id: new ObjectId(submissionId) },
        { projection: { status: 1 } }
      )
      const currentStatus = (current?.status as string | undefined) ?? ''
      const nextStatus = sanitized.status as string
      if (currentStatus && !canSubmissionTransition(currentStatus, nextStatus)) {
        if (
          currentStatus !== SubmissionStatus.PENDING &&
          currentStatus !== SubmissionStatus.JUDGING &&
          currentStatus !== SubmissionStatus.RUNNING
        ) {
          throw new Error(
            `非法状态转换: ${currentStatus} -> ${nextStatus} (submissionId=${submissionId})`
          )
        }
      }
    }

    const result = await db.collection('Submission').updateOne(
      filter,
      { $set: sanitized }
    )
    return {
      matched: result.matchedCount > 0,
      modified: result.modifiedCount > 0,
    }
  },
    3,
    { idempotent: true }
  )
}

/**
 * 直接更新题目通过数（绕过 Prisma 事务）
 * 语义：每次 AC 提交 +1（与 totalSubmit 同为提交次数口径，用于 AC 率）
 */
export async function incrementProblemAcceptedCount(problemId: string) {
  // $inc 非幂等：禁止 withRetry，避免网络重试双计
  const client = await getMongoClient()
  const db = client.db()
  await db.collection('Problem').updateOne(
    { _id: new ObjectId(problemId) },
    { $inc: { totalAccepted: 1 } }
  )
}

/** 重测回滚等路径：递减题目 AC 提交数（不低于 0） */
export async function decrementProblemAcceptedCount(problemId: string) {
  const client = await getMongoClient()
  const db = client.db()
  await db.collection('Problem').updateOne(
    { _id: new ObjectId(problemId), totalAccepted: { $gt: 0 } },
    { $inc: { totalAccepted: -1 } }
  )
}

/**
 * 检查用户是否首次 AC 此题 (读操作：可走从库)
 */
export async function isFirstAccepted(problemId: string, userId: string, currentSubmissionId: string) {
  return withRetry(
    async () => {
    const client = await getMongoClient() // 使用主库客户端，避免复制延迟导致并发 AC 重复计数
    const db = client.db()

    const previousAC = await db.collection('Submission').findOne({
      problemId: new ObjectId(problemId),
      userId: new ObjectId(userId),
      status: 'AC',
      _id: { $ne: new ObjectId(currentSubmissionId) },
    })

    return !previousAC
  },
    3,
    { idempotent: true }
  )
}
