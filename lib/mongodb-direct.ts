/**
 * MongoDB 原生驱动封装
 * 用于绕过 Prisma 事务限制，直接操作 MongoDB
 * 包含读写分离、连接池优化和自动重试机制
 */

import { MongoClient, ObjectId, ReadPreference, WriteConcern } from 'mongodb'
import { logger } from './logger'
import bcrypt from 'bcryptjs'

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj_platform?replicaSet=rs0'

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
    const client = await getMongoRoClient() // 使用只读客户端
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
 * 直接创建团队作业提交记录（绕过 Prisma 事务）
 */
export async function createTeamAssignmentSubmissionDirect(data: {
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

    await db.collection('TeamAssignmentSubmission').insertOne(submission)

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
 * 直接更新团队作业提交记录（绕过 Prisma 事务）
 */
export async function updateTeamAssignmentSubmissionDirect(
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

    await db.collection('TeamAssignmentSubmission').updateOne(
      { _id: new ObjectId(submissionId) },
      { $set: sanitized }
    )
  })
}

/**
 * 直接创建帖子分类
 */
export async function createCategoryDirect(data: {
  name: string
  description?: string
  sortOrder: number
}) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const category = {
      _id: new ObjectId(),
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.collection('Category').insertOne(category)

    return {
      id: category._id.toString(),
      ...category
    }
  })
}

/**
 * 直接创建帖子
 */
export async function createPostDirect(data: {
  title: string
  content: string
  authorId: string
  categoryId?: string
  tags: string[]
  status: string
  type?: string
}) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const post = {
      _id: new ObjectId(),
      title: data.title,
      content: data.content,
      authorId: new ObjectId(data.authorId),
      categoryId: data.categoryId ? new ObjectId(data.categoryId) : null,
      tags: data.tags,
      status: data.status,
      type: data.type || 'discussion',
      views: 0,
      likes: 0,
      isPinned: false,
      isLocked: false,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.collection('Post').insertOne(post)

    return {
      id: post._id.toString(),
      ...post,
      authorId: post.authorId.toString(),
      categoryId: post.categoryId?.toString()
    }
  })
}

/**
 * 直接创建评论
 */
export async function createCommentDirect(data: {
  content: string
  postId?: string
  solutionId?: string
  authorId: string
  parentId?: string
}) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const comment = {
      _id: new ObjectId(),
      content: data.content,
      postId: data.postId ? new ObjectId(data.postId) : null,
      solutionId: data.solutionId ? new ObjectId(data.solutionId) : null,
      authorId: new ObjectId(data.authorId),
      parentId: data.parentId ? new ObjectId(data.parentId) : null,
      likes: 0,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.collection('Comment').insertOne(comment)

    return {
      id: comment._id.toString(),
      ...comment,
      postId: comment.postId?.toString(),
      solutionId: comment.solutionId?.toString(),
      authorId: comment.authorId.toString(),
      parentId: comment.parentId?.toString()
    }
  })
}

/**
 * 直接创建点赞记录
 * 幂等设计：使用 insertOne 配合唯一索引（如果存在），或者 updateOne + upsert
 */
export async function createPostLikeDirect(userId: string, postId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()
    
    const like = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      postId: new ObjectId(postId),
      createdAt: new Date()
    }
    
    try {
      await db.collection('PostLike').insertOne(like)
      // 更新帖子点赞数
      await db.collection('Post').updateOne(
        { _id: new ObjectId(postId) },
        { $inc: { likes: 1 } }
      )
      return true
    } catch (e: any) {
      if (e.code === 11000) { // Duplicate key
        return false
      }
      throw e
    }
  })
}

/**
 * 直接删除点赞记录
 */
export async function deletePostLikeDirect(userId: string, postId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()
    
    const result = await db.collection('PostLike').deleteOne({
      userId: new ObjectId(userId),
      postId: new ObjectId(postId)
    })
    
    if (result.deletedCount > 0) {
      // 更新帖子点赞数
      await db.collection('Post').updateOne(
        { _id: new ObjectId(postId) },
        { $inc: { likes: -1 } }
      )
      return true
    }
    
    return false
  })
}

/**
 * 直接逻辑删除帖子
 */
export async function softDeletePostDirect(postId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('Post').updateOne(
      { _id: new ObjectId(postId) },
      { $set: { isDeleted: true, updatedAt: new Date() } }
    )
  })
}

/**
 * 直接更新帖子
 */
export async function updatePostDirect(
  postId: string,
  data: {
    title?: string
    content?: string
    categoryId?: string
    tags?: string[]
    status?: string
    isPinned?: boolean
    isLocked?: boolean
  }
) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const updateData: any = { ...data, updatedAt: new Date() }
    if (data.categoryId) {
      updateData.categoryId = new ObjectId(data.categoryId)
    }

    await db.collection('Post').updateOne(
      { _id: new ObjectId(postId) },
      { $set: updateData }
    )
  })
}

/**
 * 检查是否已点赞 (读操作：可走从库)
 */
export async function checkPostLikeDirect(userId: string, postId: string) {
  return withRetry(async () => {
    const client = await getMongoRoClient() // 使用只读客户端
    const db = client.db()
    
    const like = await db.collection('PostLike').findOne({
      userId: new ObjectId(userId),
      postId: new ObjectId(postId)
    })
    
    return !!like
  })
}

/**
 * 直接逻辑删除评论
 */
export async function softDeleteCommentDirect(commentId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    await db.collection('Comment').updateOne(
      { _id: new ObjectId(commentId) },
      { $set: { isDeleted: true, updatedAt: new Date() } }
    )
  })
}

/**
 * 直接增加帖子浏览量（绕过 Prisma 事务）
 * 增加去重逻辑，如果是登录用户，记录浏览历史
 */
export async function incrementPostViewsDirect(postId: string, userId?: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    if (userId) {
      // 检查是否已经浏览过 (这里可以用主库读，保证一致性，或者接受轻微不一致)
      const existingView = await db.collection('PostView').findOne({
        postId: new ObjectId(postId),
        userId: new ObjectId(userId)
      })

      if (existingView) {
        return // 已经浏览过，不再增加
      }

      try {
        // 记录浏览
        await db.collection('PostView').insertOne({
          _id: new ObjectId(),
          postId: new ObjectId(postId),
          userId: new ObjectId(userId),
          createdAt: new Date()
        })
      } catch (e: any) {
        // 忽略重复插入错误
        if (e.code !== 11000) throw e
        return 
      }
    }

    // 增加浏览量
    await db.collection('Post').updateOne(
      { _id: new ObjectId(postId) },
      { $inc: { views: 1 } }
    )
  })
}

/**
 * 直接创建竞赛及关联题目（绕过 Prisma 事务）
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

    await db.collection('Contest').insertOne(contest)

    // 2. 创建竞赛题目关联
    if (data.problemIds && data.problemIds.length > 0) {
      const contestProblems = data.problemIds.map((pid, index) => ({
        _id: new ObjectId(),
        contestId: contest._id,
        problemId: new ObjectId(pid),
        orderIndex: index,
        score: 100 // 默认分数
      }))

      await db.collection('ContestProblem').insertMany(contestProblems)
    }

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
 * 直接更新团队作业（绕过 Prisma 事务）
 */
export async function updateTeamAssignmentDirect(
  assignmentId: string,
  data: {
    title?: string
    description?: string
    startTime?: Date
    endTime?: Date
    problemIds?: string[]
  }
) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    const updateData: any = { ...data }
    
    if (data.problemIds) {
      updateData.problemIds = data.problemIds.map(id => new ObjectId(id))
    }

    await db.collection('TeamAssignment').updateOne(
      { _id: new ObjectId(assignmentId) },
      { $set: updateData }
    )
  })
}

/**
 * 直接删除团队作业（绕过 Prisma 事务）
 */
export async function deleteTeamAssignmentDirect(assignmentId: string) {
  return withRetry(async () => {
    const client = await getMongoClient()
    const db = client.db()

    // 1. 删除相关提交记录
    await db.collection('TeamAssignmentSubmission').deleteMany({
      assignmentId: new ObjectId(assignmentId)
    })

    // 2. 删除作业本身
    await db.collection('TeamAssignment').deleteOne({
      _id: new ObjectId(assignmentId)
    })
  })
}

