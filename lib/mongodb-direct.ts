/**
 * MongoDB 原生驱动封装
 * 用于绕过 Prisma 事务限制，直接操作 MongoDB
 * 包含读写分离、连接池优化和自动重试机制
 */

import { MongoClient, ObjectId, ReadPreference, WriteConcern } from 'mongodb'
import { logger } from './logger'
import bcrypt from 'bcryptjs'
import { canTransition as canSubmissionTransition, normalizeStatus } from '@/lib/constants/submission-status'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    // 构建阶段跳过（next build 时 NEXT_PHASE=phase-production-build）
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return 'mongodb://localhost:27017/oj_platform'
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 DATABASE_URL 环境变量')
    }
  }
  return url || 'mongodb://localhost:27017/oj_platform?replicaSet=rs0'
}
const MONGODB_URI = getDatabaseUrl()

// 缓存客户端实例
let cachedClient: MongoClient | null = null
let cachedRoClient: MongoClient | null = null

// 连接配置选项
const clientOptions = {
  minPoolSize: 5,
  maxPoolSize: 50,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true, // 自动重试写操作
}

/**
 * 获取主库 MongoDB 客户端连接 (Write / Strong Read)
 * WriteConcern: Majority (确保数据写入大多数节点)
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient
  }

  const client = new MongoClient(MONGODB_URI, {
    ...clientOptions,
    writeConcern: { w: 'majority', wtimeout: 5000 },
    readPreference: ReadPreference.PRIMARY,
  })

  await client.connect()
  cachedClient = client
  return client
}

/**
 * 获取只读 MongoDB 客户端连接 (Eventual Consistency Read)
 * ReadPreference: SecondaryPreferred (优先读从库)
 */
export async function getMongoRoClient(): Promise<MongoClient> {
  if (cachedRoClient) {
    return cachedRoClient
  }

  // 构造只读连接字符串或选项
  // 注意：在 MongoClient 选项中设置 readPreference 优于在 URL 中设置
  const client = new MongoClient(MONGODB_URI, {
    ...clientOptions,
    readPreference: ReadPreference.SECONDARY_PREFERRED,
  })

  await client.connect()
  cachedRoClient = client
  return client
}

/**
 * 执行带重试的数据库操作
 * @param operation 数据库操作函数
 * @param retries 重试次数
 */
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await operation()
  } catch (error: any) {
    if (retries > 0 && (
      error.name === 'MongoNetworkError' || 
      error.name === 'MongoTimeoutError' || 
      error.code === 10107 // NotWritablePrimary
    )) {
      logger.warn(`Database operation failed, retrying... (${retries} attempts left)`, { error: error.message })
      await new Promise(resolve => setTimeout(resolve, 1000)) // 等待1秒后重试
      // 如果是因为主节点变更导致的连接失效，尝试清除缓存
      if (error.code === 10107) {
         cachedClient = null;
      }
      return withRetry(operation, retries - 1)
    }
    throw error
  }
}

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
    //   2) 通过 canSubmissionTransition 校验合法转换
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
 * 直接创建竞赛及关联题目（绕过 Prisma 事务）
 * insertOne + insertMany 放入 MongoDB session 事务，保证原子性
 */
export async function createContestDirect(data: {
  title: string
  description: string
  type: string
  startTime: Date
  endTime: Date
  duration: number
  isPublic: boolean
  password?: string
  authorId: string
  problemIds?: string[]
}) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    // 1. 创建竞赛
    const hashedPassword = data.password ? await bcrypt.hash(data.password, 12) : null

    const contest = {
      _id: new ObjectId(),
      title: data.title,
      description: data.description,
      type: data.type,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      isPublic: data.isPublic,
      password: hashedPassword,
      authorId: new ObjectId(data.authorId),
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const contestProblems =
      data.problemIds && data.problemIds.length > 0
        ? data.problemIds.map((pid, index) => ({
            _id: new ObjectId(),
            contestId: contest._id,
            problemId: new ObjectId(pid),
            orderIndex: index,
            score: 100, // 默认分数
          }))
        : []

    // insertOne + insertMany 放入事务，任一步失败则整体回滚
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await db.collection('Contest').insertOne(contest, { session })
        if (contestProblems.length > 0) {
          await db.collection('ContestProblem').insertMany(contestProblems, { session })
        }
      })
    })

    return {
      id: contest._id.toString(),
      ...contest,
      authorId: contest.authorId.toString()
    }
  })
}

/**
 * 直接报名竞赛（绕过 Prisma 事务）
 */
export async function registerContestParticipantDirect(data: {
  contestId: string
  userId: string
  inviteCode?: string
}) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    // 检查是否已经报名 (Double check)
    const existing = await db.collection('ContestParticipant').findOne({
      contestId: new ObjectId(data.contestId),
      userId: new ObjectId(data.userId)
    })

    if (existing) {
      throw new Error('Already registered')
    }

    const participant = {
      _id: new ObjectId(),
      contestId: new ObjectId(data.contestId),
      userId: new ObjectId(data.userId),
      inviteCode: data.inviteCode || null,
      score: 0,
      rank: 0,
      penalty: 0,
      joinedAt: new Date()
    }

    await db.collection('ContestParticipant').insertOne(participant)

    return {
      id: participant._id.toString(),
      ...participant,
      contestId: participant.contestId.toString(),
      userId: participant.userId.toString()
    }
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

        // 4. 删除 AssignmentCompletionRewardLog（奖励日志，Phase 2+ 预留）
        await db
          .collection('AssignmentCompletionRewardLog')
          .deleteMany({ assignmentId: assignmentObjectId }, { session })

        // 5. 置空主 Submission 表中的 assignmentSubmissionId 引用（保留 Submission 记录本身）
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

