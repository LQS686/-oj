/**
 * Contest / ContestParticipant 相关直操作（绕过 Prisma 事务）
 *
 * 包含竞赛创建（含 ContestProblem 批量插入、原子事务）和竞赛报名。
 */

import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import { getMongoClient, withRetry } from './client'

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
