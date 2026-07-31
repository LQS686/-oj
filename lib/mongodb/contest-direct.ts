/**
 * Contest / ContestParticipant 相关直操作（绕过 Prisma 事务）
 *
 * 包含竞赛创建（含 ContestProblem 批量插入、原子事务）和竞赛报名。
 */

import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import { getMongoClient } from './client'
import { errorLike } from '@/lib/api/errors'

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
  sealRankTime?: Date | null
}) {
  const _id = new ObjectId()
  const client = await getMongoClient()
  const db = client.db()

  // 竞赛仅允许 public / contest 可见性题目
  if (data.problemIds && data.problemIds.length > 0) {
    const { prisma } = await import('@/lib/prisma')
    const { ApiError } = await import('@/lib/api/withApi')
    const found = await prisma.problem.findMany({
      where: { id: { in: data.problemIds } },
      select: { id: true, visibility: true },
    })
    if (found.length !== data.problemIds.length) {
      throw new ApiError('INVALID_PROBLEMS', '存在无效的题目 ID', 400)
    }
    const invalid = found.filter(
      (p) => p.visibility !== 'public' && p.visibility !== 'contest'
    )
    if (invalid.length > 0) {
      throw new ApiError(
        'INVALID_PROBLEMS',
        '竞赛只能添加公开或竞赛可见题目',
        400
      )
    }
  }

  let sealRankTime: Date | null = null
  if (data.sealRankTime) {
    const seal = data.sealRankTime instanceof Date ? data.sealRankTime : new Date(data.sealRankTime)
    if (isNaN(seal.getTime())) {
      const { ApiError } = await import('@/lib/api/withApi')
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间格式无效', 400)
    }
    if (seal.getTime() <= data.startTime.getTime() || seal.getTime() >= data.endTime.getTime()) {
      const { ApiError } = await import('@/lib/api/withApi')
      throw new ApiError('INVALID_SEAL_TIME', '封榜时间必须在比赛起止时间范围内', 400)
    }
    sealRankTime = seal
  }

  const hashedPassword = data.password ? await bcrypt.hash(data.password, 12) : null

  const contest = {
    _id,
    title: data.title,
    description: data.description,
    type: data.type,
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.duration,
    isPublic: data.isPublic,
    password: hashedPassword,
    authorId: new ObjectId(data.authorId),
    sealRankTime,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const contestProblems =
    data.problemIds && data.problemIds.length > 0
      ? data.problemIds.map((pid, index) => ({
          _id: new ObjectId(),
          contestId: contest._id,
          problemId: new ObjectId(pid),
          orderIndex: index,
          score: 100,
        }))
      : []

  try {
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await db.collection('Contest').insertOne(contest, { session })
        if (contestProblems.length > 0) {
          await db.collection('ContestProblem').insertMany(contestProblems, { session })
        }
      })
    })
  } catch (error: unknown) {
    const e = errorLike(error)
    if (Number(e.code) !== 11000) throw error
  }

  return {
    id: contest._id.toString(),
    title: contest.title,
    description: contest.description,
    type: contest.type,
    startTime: contest.startTime,
    endTime: contest.endTime,
    duration: contest.duration,
    isPublic: contest.isPublic,
    authorId: contest.authorId.toString(),
    createdAt: contest.createdAt,
    updatedAt: contest.updatedAt,
    hasPassword: Boolean(hashedPassword),
  }
}

/**
 * 直接报名竞赛（绕过 Prisma 事务）
 */
export async function registerContestParticipantDirect(data: {
  contestId: string
  userId: string
  inviteCode?: string
}) {
  const _id = new ObjectId()
  const client = await getMongoClient()
  const db = client.db()

  const existing = await db.collection('ContestParticipant').findOne({
    contestId: new ObjectId(data.contestId),
    userId: new ObjectId(data.userId),
  })

  if (existing) {
    throw new Error('Already registered')
  }

  const participant = {
    _id,
    contestId: new ObjectId(data.contestId),
    userId: new ObjectId(data.userId),
    inviteCode: data.inviteCode || null,
    score: 0,
    rank: 0,
    penalty: 0,
    joinedAt: new Date(),
  }

  try {
    await db.collection('ContestParticipant').insertOne(participant)
  } catch (error: unknown) {
    const e = errorLike(error)
    if (Number(e.code) === 11000) {
      throw new Error('Already registered')
    }
    throw error
  }

  return {
    id: participant._id.toString(),
    ...participant,
    contestId: participant.contestId.toString(),
    userId: participant.userId.toString(),
  }
}
