/**
 * AssignmentSubmission / Assignment 相关直操作（绕过 Prisma 事务）
 *
 * 包含班级作业提交的创建/更新/删除、班级作业本身的更新/删除、
 * 以及作业维度首次 AC 判定（isFirstAcInAssignment）。
 */

import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import {
  SubmissionStatus,
  canTransition as canSubmissionTransition,
} from '@/lib/constants/submission-status'
import { getMongoClient, withRetry } from './client'
import { errorLike } from '@/lib/api/errors'

/**
 * 检查用户在指定作业中是否首次 AC 此题（作业维度，区别于全局 isFirstAccepted）
 * 读取 ClassAssignmentSubmission 表，判断除当前提交外是否还存在 AC 记录。
 */
export async function isFirstAcInAssignment(
  assignmentId: string,
  problemId: string,
  userId: string,
  currentSubmissionId: string
): Promise<boolean> {
  return withRetry(
    async () => {
    const client = await getMongoClient() // 使用主库客户端，避免复制延迟导致并发 AC 重复计数
    const db = client.db()

    const existing = await db.collection('ClassAssignmentSubmission').findOne({
      assignmentId: new ObjectId(assignmentId),
      problemId: new ObjectId(problemId),
      userId: new ObjectId(userId),
      status: 'AC',
      _id: { $ne: new ObjectId(currentSubmissionId) },
    })

    return !existing
  },
    3,
    { idempotent: true }
  )
}

/**
 * 直接创建班级作业提交记录（绕过 Prisma 事务）
 */
export async function createClassAssignmentSubmissionDirect(data: {
  assignmentId: string
  userId: string
  problemId: string
  code: string
  language: string
  status: string
  totalTests: number
  isLate: boolean
}) {
  const _id = new ObjectId()
  const client = await getMongoClient()
  const db = client.db()

  const submission = {
    _id,
    assignmentId: new ObjectId(data.assignmentId),
    userId: new ObjectId(data.userId),
    problemId: new ObjectId(data.problemId),
    code: data.code,
    language: data.language,
    status: data.status,
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: data.totalTests,
    message: null,
    submittedAt: new Date(),
    isLate: data.isLate,
  }

  try {
    await db.collection('ClassAssignmentSubmission').insertOne(submission)
  } catch (error: unknown) {
    const e = errorLike(error)
    if (Number(e.code) !== 11000) throw error
  }

  return {
    id: submission._id.toString(),
    ...submission,
    assignmentId: submission.assignmentId.toString(),
    userId: submission.userId.toString(),
    problemId: submission.problemId.toString(),
  }
}

export type UpdateClassAssignmentSubmissionDirectResult = {
  matched: boolean
  modified: boolean
}

/**
 * 直接更新班级作业提交记录（绕过 Prisma 事务）
 *
 * @param options.onlyFromStatuses 原子条件：仅当当前 status ∈ 集合时更新（防 active/completed 竞态）
 */
export async function updateClassAssignmentSubmissionDirect(
  submissionId: string,
  data: {
    status?: string
    score?: number
    time?: number
    memory?: number
    passedTests?: number
    message?: string
    isFirstAc?: boolean
    timeElapsedMs?: number
  },
  options?: { forceStatus?: boolean; onlyFromStatuses?: string[] }
): Promise<UpdateClassAssignmentSubmissionDirectResult> {
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
      'message',
      'isFirstAc',
      'timeElapsedMs',
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

    // 状态机守卫（与 updateSubmissionDirect 一致）
    // forceStatus：管理员重测，允许终态 → PENDING
    if (
      typeof sanitized.status === 'string' &&
      !options?.forceStatus &&
      !options?.onlyFromStatuses?.length
    ) {
      const current = await db.collection('ClassAssignmentSubmission').findOne(
        { _id: new ObjectId(submissionId) },
        { projection: { status: 1 } }
      )
      const currentStatus = (current?.status as string | undefined) ?? ''
      const nextStatus = sanitized.status as string
      if (currentStatus && !canSubmissionTransition(currentStatus, nextStatus)) {
        logger.warn(
          `非法状态转换: ClassAssignmentSubmission ${submissionId} ${currentStatus} -> ${nextStatus}`
        )
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

    const result = await db.collection('ClassAssignmentSubmission').updateOne(
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
 * 直接更新班级作业（绕过 Prisma 事务）
 */
export async function updateClassAssignmentDirect(
  assignmentId: string,
  data: {
    title?: string
    description?: string
    startTime?: Date
    endTime?: Date
    problemIds?: string[]
    allowLateSubmission?: boolean
  }
) {
  return withRetry(
    async () => {
    const client = await getMongoClient()
    const db = client.db()

    const updateData: Record<string, unknown> = { ...data }

    if (data.problemIds) {
      updateData.problemIds = data.problemIds.map(id => new ObjectId(id))
    }

    await db.collection('ClassAssignment').updateOne(
      { _id: new ObjectId(assignmentId) },
      { $set: updateData }
    )
  },
    3,
    { idempotent: true }
  )
}

/**
 * 直接删除班级作业（绕过 Prisma 事务）
 * deleteMany + deleteOne 放入 MongoDB session 事务，保证原子性
 */
export async function deleteClassAssignmentDirect(assignmentId: string) {
  return withRetry(
    async () => {
    const client = await getMongoClient()
    const db = client.db()

    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        const assignmentObjectId = new ObjectId(assignmentId)

        // 1. 查询所有 ClassAssignmentSubmission 的 ID（用于清理主 Submission 表引用）
        const submissions = await db
          .collection('ClassAssignmentSubmission')
          .find({ assignmentId: assignmentObjectId }, { session })
          .toArray()
        const submissionIds = submissions.map((s) => s._id)

        // 2. 删除 ClassAssignmentProblemProgress（计时记录）
        await db
          .collection('ClassAssignmentProblemProgress')
          .deleteMany({ assignmentId: assignmentObjectId }, { session })

        // 3. 删除 ClassAssignmentProblem（单题配置表，Phase 2+ 预留）
        await db
          .collection('ClassAssignmentProblem')
          .deleteMany({ assignmentId: assignmentObjectId }, { session })

        // 4. 置空主 Submission 表中的 assignmentSubmissionId 引用（保留 Submission 记录本身）
        if (submissionIds.length > 0) {
          await db
            .collection('Submission')
            .updateMany(
              { assignmentSubmissionId: { $in: submissionIds } },
              { $unset: { assignmentSubmissionId: '' } },
              { session }
            )
        }

        // 6. 删除 ClassAssignmentSubmission（原有逻辑）
        await db
          .collection('ClassAssignmentSubmission')
          .deleteMany({ assignmentId: assignmentObjectId }, { session })

        // 7. 删除 ClassAssignment 本身（原有逻辑）
        await db
          .collection('ClassAssignment')
          .deleteOne({ _id: assignmentObjectId }, { session })
      })
    })
  },
    3,
    { idempotent: true }
  )
}

/**
 * 直接删除班级作业提交记录（用于 submitAssignmentCode 失败时的补偿回滚）
 */
export async function deleteClassAssignmentSubmissionDirect(submissionId: string) {
  return withRetry(
    async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('ClassAssignmentSubmission').deleteOne({
      _id: new ObjectId(submissionId)
    })
  },
    3,
    { idempotent: true }
  )
}
