/**
 * AssignmentSubmission / Assignment 相关直操作（绕过 Prisma 事务）
 *
 * 包含班级作业提交的创建/更新/删除、班级作业本身的更新/删除、
 * 以及作业维度首次 AC 判定（isFirstAcInAssignment）。
 */

import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import { canTransition as canSubmissionTransition, normalizeStatus } from '@/lib/constants/submission-status'
import { getMongoClient, withRetry } from './client'

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
  return withRetry(async () => {
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
  })
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
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const submission = {
      _id: new ObjectId(),
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
      isLate: data.isLate
    }

    await db.collection('ClassAssignmentSubmission').insertOne(submission)

    return {
      id: submission._id.toString(),
      ...submission,
      assignmentId: submission.assignmentId.toString(),
      userId: submission.userId.toString(),
      problemId: submission.problemId.toString()
    }
  })
}

/**
 * 直接更新班级作业提交记录（绕过 Prisma 事务）
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
  }
) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const sanitized: Record<string, unknown> = {}
    const allowedFields = ['status', 'score', 'time', 'memory', 'passedTests', 'message']
    for (const key of allowedFields) {
      if (key in data && data[key as keyof typeof data] !== undefined) {
        sanitized[key] = data[key as keyof typeof data]
      }
    }

    // P0 修复：状态机守卫（与 updateSubmissionDirect 一致）
    //   1) 若要更新 status，先读当前状态
    //   2) 通过 canTransition 校验合法转换
    //   3) 仅在 PENDING/JUDGING/RUNNING 状态下允许非合法转换（recover 场景，worker 重试/竞态/恢复/跳过中间状态）
    //      归一化后比较，兼容历史大驼峰写法（'Pending'/'Judging'）与枚举大写（'PENDING'/'JUDGING'）
    if (typeof sanitized.status === 'string') {
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
        // 允许 recover 路径：PENDING/JUDGING/RUNNING 状态可被强制覆盖（与 updateSubmissionDirect 一致）
        const normalized = normalizeStatus(currentStatus)
        if (normalized !== 'PENDING' && normalized !== 'JUDGING' && normalized !== 'RUNNING') {
          throw new Error(
            `非法状态转换: ${currentStatus} -> ${nextStatus} (submissionId=${submissionId})`
          )
        }
      }
    }

    await db.collection('ClassAssignmentSubmission').updateOne(
      { _id: new ObjectId(submissionId) },
      { $set: sanitized }
    )
  })
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
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const updateData: any = { ...data }

    if (data.problemIds) {
      updateData.problemIds = data.problemIds.map(id => new ObjectId(id))
    }

    await db.collection('ClassAssignment').updateOne(
      { _id: new ObjectId(assignmentId) },
      { $set: updateData }
    )
  })
}

/**
 * 直接删除班级作业（绕过 Prisma 事务）
 * deleteMany + deleteOne 放入 MongoDB session 事务，保证原子性
 */
export async function deleteClassAssignmentDirect(assignmentId: string) {
  return withRetry(async () => {
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
  })
}

/**
 * 直接删除班级作业提交记录（用于 submitAssignmentCode 失败时的补偿回滚）
 */
export async function deleteClassAssignmentSubmissionDirect(submissionId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('ClassAssignmentSubmission').deleteOne({
      _id: new ObjectId(submissionId)
    })
  })
}
