/**
 * Submission 相关直操作（绕过 Prisma 事务）
 *
 * 包含 Submission 表的创建/更新、Problem 表的提交数/通过数自增、首次 AC 判定。
 */

import { ObjectId } from 'mongodb'
import { canTransition as canSubmissionTransition, normalizeStatus } from '@/lib/constants/submission-status'
import { getMongoClient, withRetry } from './client'

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
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const submission = {
      _id: new ObjectId(),
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
      assignmentSubmissionId: data.assignmentSubmissionId ? new ObjectId(data.assignmentSubmissionId) : null
    }

    await db.collection('Submission').insertOne(submission)

    return {
      id: submission._id.toString(),
      ...submission,
      problemId: submission.problemId.toString(),
      userId: submission.userId.toString(),
      contestId: submission.contestId?.toString(),
      assignmentSubmissionId: submission.assignmentSubmissionId?.toString()
    }
  })
}

/**
 * 直接更新题目提交数（绕过 Prisma 事务）
 */
export async function incrementProblemSubmitCount(problemId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('Problem').updateOne(
      { _id: new ObjectId(problemId) },
      { $inc: { totalSubmit: 1 } }
    )
  })
}

/**
 * 直接更新提交记录（绕过 Prisma 事务）
 */
export async function updateSubmissionDirect(
  submissionId: string,
  data: {
    status?: string
    score?: number
    time?: number
    memory?: number
    passedTests?: number
    message?: string
    testResults?: any
  }
) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const sanitized: Record<string, unknown> = {}
    const allowedFields = ['status', 'score', 'time', 'memory', 'passedTests', 'message', 'testResults']
    for (const key of allowedFields) {
      if (key in data && data[key as keyof typeof data] !== undefined) {
        sanitized[key] = data[key as keyof typeof data]
      }
    }

    // P0 修复：状态机守卫
    //   1) 若要更新 status，先读当前状态
    //   2) 通过 canTransition 校验合法转换
    //   3) 仅在 PENDING/JUDGING/RUNNING 状态下允许非合法转换（recover 场景）
    //      归一化后比较，兼容历史大驼峰写法（'Pending'/'Judging'）与枚举大写（'PENDING'/'JUDGING'）
    if (typeof sanitized.status === 'string') {
      const current = await db.collection('Submission').findOne(
        { _id: new ObjectId(submissionId) },
        { projection: { status: 1 } }
      )
      const currentStatus = (current?.status as string | undefined) ?? ''
      const nextStatus = sanitized.status as string
      if (currentStatus && !canSubmissionTransition(currentStatus, nextStatus)) {
        // 允许 recover 路径：PENDING/JUDGING/RUNNING 状态可被强制覆盖（worker 重试/竞态/恢复/跳过中间状态）
        const normalized = normalizeStatus(currentStatus)
        if (normalized !== 'PENDING' && normalized !== 'JUDGING' && normalized !== 'RUNNING') {
          throw new Error(
            `非法状态转换: ${currentStatus} -> ${nextStatus} (submissionId=${submissionId})`
          )
        }
      }
    }

    await db.collection('Submission').updateOne(
      { _id: new ObjectId(submissionId) },
      { $set: sanitized }
    )
  })
}

/**
 * 直接更新题目通过数（绕过 Prisma 事务）
 */
export async function incrementProblemAcceptedCount(problemId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('Problem').updateOne(
      { _id: new ObjectId(problemId) },
      { $inc: { totalAccepted: 1 } }
    )
  })
}

/**
 * 检查用户是否首次 AC 此题 (读操作：可走从库)
 */
export async function isFirstAccepted(problemId: string, userId: string, currentSubmissionId: string) {
  return withRetry(async () => {
    const client = await getMongoClient() // 使用主库客户端，避免复制延迟导致并发 AC 重复计数
    const db = client.db()

    const previousAC = await db.collection('Submission').findOne({
      problemId: new ObjectId(problemId),
      userId: new ObjectId(userId),
      status: 'AC',
      _id: { $ne: new ObjectId(currentSubmissionId) },
    })

    return !previousAC
  })
}
