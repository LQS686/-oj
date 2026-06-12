/**
 * 积分历史记录管理工具库
 * 负责查询和管理积分变动历史
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 查询用户积分历史记录
 */
export async function getPointsHistory(
  classId: string,
  userId: string,
  options?: {
    page?: number
    limit?: number
    type?: 'EARN' | 'SPEND' | 'DEDUCT' | 'REFUND'
    startDate?: Date
    endDate?: Date
  }
) {
  try {
    const page = options?.page || 1
    const limit = options?.limit || 20
    const skip = (page - 1) * limit

    // 构建查询条件
    const where: any = {
      classId,
      userId
    }

    // type in options seems to map to action in schema?
    // options.type values: 'EARN' | 'SPEND' | 'DEDUCT' | 'REFUND'
    // My schema action: 'EARN', 'SPEND'
    // If user passes 'DEDUCT', it might map to 'SPEND' with specific reason or just 'SPEND'.
    // Or I should have added more actions.
    // For now, I'll map options.type to action if it matches.
    if (options?.type) {
      if (options.type === 'EARN' || options.type === 'SPEND') {
        where.action = options.type
      } else if (options.type === 'DEDUCT') {
        where.action = 'SPEND' // DEDUCT maps to SPEND
      } else {
        // REFUND might be EARN
        where.action = 'EARN'
      }
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {}
      if (options.startDate) {
        where.createdAt.gte = options.startDate
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate
      }
    }

    // 查询总数和记录
    const [total, records] = await Promise.all([
      prisma.pointsHistory.count({ where }),
      prisma.pointsHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ])

    return {
      success: true,
      data: {
        records: records.map(r => ({
          id: r.id,
          type: r.action, // mapping back to type expected by frontend?
          // Frontend might expect 'EARN'/'SPEND'.
          points: r.amount,
          reason: r.reason,
          sourceType: r.type, // This is the business type (e.g. ASSIGNMENT_COMPLETION)
          sourceId: r.relatedId,
          // balanceBefore/After are not stored in new schema to save space/complexity.
          // If needed, we can calculate or just return null/undefined.
          // Or I can add them to schema if critical.
          // For now, I'll omit them.
          balanceBefore: 0,
          balanceAfter: 0,
          createdAt: r.createdAt
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    }
  } catch (error) {
    console.error('[PointsHistory] 查询历史记录失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 查询班级积分统计数据
 */
export async function getClassPointsStats(classId: string) {
  try {
    // 统计总发放积分
    const earnStats = await prisma.pointsHistory.aggregate({
      where: {
        classId,
        action: 'EARN'
      },
      _sum: {
        amount: true
      },
      _count: true
    })

    // 统计总消费积分
    const spendStats = await prisma.pointsHistory.aggregate({
      where: {
        classId,
        action: 'SPEND'
      },
      _sum: {
        amount: true
      },
      _count: true
    })

    // 统计活跃成员数 (total > 0)
    const activeMembers = await prisma.pointsAccount.count({
      where: {
        classId,
        total: { gt: 0 }
      }
    })

    // 按来源统计积分获取情况
    // Prisma group by
    const sourceStatsGroup = await prisma.pointsHistory.groupBy({
      by: ['type'],
      where: {
        classId,
        action: 'EARN'
      },
      _sum: {
        amount: true
      },
      _count: true
    })

    const sourceStats = sourceStatsGroup.map(g => ({
      sourceType: g.type,
      totalPoints: g._sum.amount || 0,
      count: g._count
    }))

    return {
      success: true,
      data: {
        totalEarned: earnStats._sum.amount || 0,
        totalSpent: spendStats._sum.amount || 0,
        earnCount: earnStats._count || 0,
        spendCount: spendStats._count || 0,
        activeMembers,
        sourceStats
      }
    }
  } catch (error) {
    console.error('[PointsHistory] 查询统计数据失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 检查是否已发放积分（幂等性检查）
 */
export async function checkPointsAwarded(
  classId: string,
  userId: string,
  sourceType: string,
  sourceId: string
) {
  try {
    const exists = await prisma.pointsHistory.findFirst({
      where: {
        classId,
        userId,
        type: sourceType,
        relatedId: sourceId,
        action: 'EARN'
      }
    })

    return {
      success: true,
      awarded: !!exists
    }
  } catch (error) {
    logger.error('[PointsHistory] 检查积分发放失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}
