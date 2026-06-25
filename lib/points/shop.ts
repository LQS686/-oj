/**
 * 积分商城管理工具库
 * 负责商品管理和兑换逻辑
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 获取商城商品列表
 */
export async function getShopItems(
  classId: string,
  options?: {
    category?: string
    isActive?: boolean
    page?: number
    limit?: number
  }
) {
  try {
    const page = options?.page || 1
    const limit = options?.limit || 20
    const skip = (page - 1) * limit

    // 构建查询条件
    const where: any = { classId }

    if (options?.category) {
      where.category = options.category
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive
    }

    // 查询总数
    const total = await prisma.pointsShopItem.count({ where })

    // 查询商品
    const items = await prisma.pointsShopItem.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      skip,
      take: limit
    })

    return {
      success: true,
      data: {
        items: items.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          pointsRequired: item.pointsRequired,
          stock: item.stock,
          isUnlimited: item.isUnlimited,
          imageUrl: item.imageUrl,
          isActive: item.isActive,
          sortOrder: item.sortOrder
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
    console.error('[PointsShop] 获取商品列表失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 创建商品
 */
export async function createShopItem(
  classId: string,
  itemData: {
    name: string
    description?: string
    category: string
    pointsRequired: number
    stock?: number
    isUnlimited?: boolean
    imageUrl?: string
    sortOrder?: number
  }
) {
  try {
    const item = await prisma.pointsShopItem.create({
      data: {
        classId,
        name: itemData.name,
        description: itemData.description || '',
        category: itemData.category,
        pointsRequired: itemData.pointsRequired,
        stock: itemData.stock || 0,
        isUnlimited: itemData.isUnlimited || false,
        imageUrl: itemData.imageUrl || '',
        isActive: true,
        sortOrder: itemData.sortOrder || 0
      }
    })

    return {
      success: true,
      data: item
    }
  } catch (error) {
    console.error('[PointsShop] 创建商品失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 更新商品信息
 */
export async function updateShopItem(
  itemId: string,
  updates: {
    name?: string
    description?: string
    pointsRequired?: number
    stock?: number
    isUnlimited?: boolean
    imageUrl?: string
    isActive?: boolean
    sortOrder?: number
  }
) {
  try {
    const updateData: any = {}

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.pointsRequired !== undefined) updateData.pointsRequired = updates.pointsRequired
    if (updates.stock !== undefined) updateData.stock = updates.stock
    if (updates.isUnlimited !== undefined) updateData.isUnlimited = updates.isUnlimited
    if (updates.imageUrl !== undefined) updateData.imageUrl = updates.imageUrl
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive
    if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder

    await prisma.pointsShopItem.update({
      where: { id: itemId },
      data: updateData
    })

    return {
      success: true,
      message: '商品更新成功'
    }
  } catch (error) {
    console.error('[PointsShop] 更新商品失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 兑换商品
 */
export async function exchangeItem(
  classId: string,
  userId: string,
  itemId: string,
  quantity: number = 1,
  deliveryInfo?: any
) {
  try {
    return await prisma.$transaction(async (tx: any) => {
      // 1. 查询商品信息并锁定（乐观锁或直接检查）
      const item = await tx.pointsShopItem.findUnique({
        where: { id: itemId }
      })

      if (!item) {
        throw new Error('商品不存在')
      }

      if (!item.isActive) {
        throw new Error('商品已下架')
      }

      // 2. 检查库存
      if (!item.isUnlimited && item.stock < quantity) {
        throw new Error('库存不足')
      }

      const totalPoints = item.pointsRequired * quantity

      // 3. 检查余额并扣除积分
      const account = await tx.pointsAccount.findUnique({
        where: {
          classId_userId: {
            classId,
            userId
          }
        }
      })

      if (!account || account.balance < totalPoints) {
        throw new Error('积分余额不足')
      }

      // 扣除积分
      await tx.pointsAccount.update({
        where: {
          classId_userId: {
            classId,
            userId
          }
        },
        data: {
          balance: { decrement: totalPoints }
        }
      })

      // 记录积分历史
      await tx.pointsHistory.create({
        data: {
          classId,
          userId,
          amount: totalPoints, // 存储为正数
          reason: `兑换商品：${item.name} x${quantity}`,
          type: 'SHOP_EXCHANGE', // sourceType
          action: 'SPEND',
          relatedId: itemId
        }
      })

      // 4. 扣减库存
      if (!item.isUnlimited) {
        await tx.pointsShopItem.update({
          where: { id: itemId },
          data: { stock: { decrement: quantity } }
        })
      }

      // 5. 创建兑换记录
      const exchange = await tx.pointsExchange.create({
        data: {
          classId,
          userId,
          itemId,
          itemName: item.name,
          pointsSpent: totalPoints,
          quantity,
          status: 'PENDING',
          deliveryInfo: deliveryInfo || {}
        }
      })

      return {
        success: true,
        data: {
          exchangeId: exchange.id,
          message: '兑换成功，等待发货'
        }
      }
    })
  } catch (error) {
    logger.error('[PointsShop] 兑换商品失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 查询兑换记录
 */
export async function getExchangeRecords(
  classId: string,
  userId?: string,
  options?: {
    status?: string
    page?: number
    limit?: number
  }
) {
  try {
    const page = options?.page || 1
    const limit = options?.limit || 20
    const skip = (page - 1) * limit

    // 构建查询条件
    const where: any = { classId }

    if (userId) {
      where.userId = userId
    }

    if (options?.status) {
      where.status = options.status
    }

    // 查询总数
    const total = await prisma.pointsExchange.count({ where })

    // 查询记录
    const records = await prisma.pointsExchange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })

    // 获取用户信息（如果是查询所有用户的记录）
    let userMap = new Map()
    if (!userId && records.length > 0) {
      const userIds = [...new Set(records.map((r: any) => r.userId))]
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true }
      })
      userMap = new Map<any, any>(users.map((u: any) => [u.id, u]))
    }

    return {
      success: true,
      data: {
        records: records.map((r: any) => {
          const user = userMap.get(r.userId)
          return {
            id: r.id,
            itemName: r.itemName,
            pointsSpent: r.pointsSpent,
            quantity: r.quantity,
            status: r.status,
            deliveryInfo: r.deliveryInfo,
            userName: user?.username || '未知用户',
            userNickname: user?.nickname || user?.username,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          }
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    }
  } catch (error) {
    logger.error('[PointsShop] 查询兑换记录失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 更新兑换状态
 */
export async function updateExchangeStatus(
  exchangeId: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED'
) {
  try {
    await prisma.pointsExchange.update({
      where: { id: exchangeId },
      data: { status }
    })

    return {
      success: true,
      message: '状态更新成功'
    }
  } catch (error) {
    logger.error('[PointsShop] 更新兑换状态失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}
