/**
 * 积分账户管理工具库
 * 负责积分账户的创建、查询、更新等操作
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 获取或创建团队成员积分账户
 */
export async function getOrCreatePointsAccount(teamId: string, userId: string) {
  try {
    // 尝试获取现有账户
    let account = await prisma.pointsAccount.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId
        }
      }
    })

    // 如果不存在则创建新账户
    if (!account) {
      account = await prisma.pointsAccount.create({
        data: {
          teamId,
          userId,
          balance: 0,
          total: 0
        }
      })
    }

    return {
      success: true,
      data: {
        id: account.id,
        teamId: account.teamId,
        userId: account.userId,
        totalPoints: account.total,
        availablePoints: account.balance,
        // usedPoints 不再存储，可以通过计算得出，或者简化API
        createdAt: new Date(), // Prisma doesn't strictly track createdAt for update unless field exists
        updatedAt: account.updatedAt
      }
    }
  } catch (error) {
    logger.error('[PointsAccount] 获取/创建账户失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 查询积分账户余额
 */
export async function getPointsBalance(teamId: string, userId: string) {
  try {
    const account = await prisma.pointsAccount.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId
        }
      }
    })

    if (!account) {
      return {
        success: true,
        data: {
          totalPoints: 0,
          availablePoints: 0,
          usedPoints: 0
        }
      }
    }

    return {
      success: true,
      data: {
        totalPoints: account.total,
        availablePoints: account.balance,
        usedPoints: account.total - account.balance
      }
    }
  } catch (error) {
    logger.error('[PointsAccount] 查询余额失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 增加积分（原子操作）
 */
export async function addPoints(
  teamId: string,
  userId: string,
  points: number,
  reason: string,
  sourceType: string,
  sourceId?: string
) {
  try {
    // 使用事务确保原子性
    await prisma.$transaction(async (tx) => {
      // 1. 确保账户存在并更新积分
      // upsert: 如果存在则更新，不存在则创建
      await tx.pointsAccount.upsert({
        where: {
          teamId_userId: {
            teamId,
            userId
          }
        },
        create: {
          teamId,
          userId,
          balance: points,
          total: points
        },
        update: {
          balance: { increment: points },
          total: { increment: points }
        }
      })

      // 2. 记录积分历史
      await tx.pointsHistory.create({
        data: {
          teamId,
          userId,
          action: 'EARN',
          amount: points,
          reason,
          type: sourceType, // 使用 sourceType 作为 type
          relatedId: sourceId
        }
      })
    })

    return {
      success: true,
      message: `成功增加 ${points} 积分`
    }
  } catch (error) {
    logger.error('[PointsAccount] 增加积分失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 扣除积分（原子操作，带余额检查）
 */
export async function deductPoints(
  teamId: string,
  userId: string,
  points: number,
  reason: string,
  sourceType: string,
  sourceId?: string
) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. 检查余额
      const account = await tx.pointsAccount.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId
          }
        }
      })

      if (!account || account.balance < points) {
        throw new Error('积分余额不足')
      }

      // 2. 扣除积分
      await tx.pointsAccount.update({
        where: {
          teamId_userId: {
            teamId,
            userId
          }
        },
        data: {
          balance: { decrement: points }
          // usedPoints logic? total stays same.
        }
      })

      // 3. 记录历史
      await tx.pointsHistory.create({
        data: {
          teamId,
          userId,
          action: 'SPEND',
          amount: points, // 存储为正数
          reason,
          type: sourceType, // 使用 sourceType 作为 type
          relatedId: sourceId
        }
      })
    })

    return {
      success: true,
      message: `成功扣除 ${points} 积分`
    }
  } catch (error) {
    logger.error('[PointsAccount] 扣除积分失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 获取团队积分排行榜
 */
export async function getTeamPointsRanking(teamId: string, limit: number = 10) {
  try {
    const rankings = await prisma.pointsAccount.findMany({
      where: { teamId },
      orderBy: { total: 'desc' },
      take: limit
    })

    // 获取用户信息
    const userIds = rankings.map(r => r.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true
      }
    })

    const userMap = new Map(users.map(u => [u.id, u]))

    const result = rankings.map((rank, index) => {
      const user = userMap.get(rank.userId)
      return {
        rank: index + 1,
        userId: rank.userId,
        username: user?.username || '未知用户',
        nickname: user?.nickname || user?.username || '未知用户',
        avatar: user?.avatar,
        totalPoints: rank.total,
        availablePoints: rank.balance
      }
    })

    return {
      success: true,
      data: result
    }
  } catch (error) {
    logger.error('[PointsAccount] 查询排行榜失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}
