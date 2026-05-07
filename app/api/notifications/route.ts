import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'

// 获取通知列表
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const currentUserId = user.userId

    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50
    
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const skip = (page - 1) * limit

    const where: Prisma.NotificationWhereInput = { userId: currentUserId }
    
    if (unreadOnly) {
      where.isRead = false
    }

    // 获取通知列表
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })

    // 获取总数
    const total = await prisma.notification.count({ where })

    // 获取未读数量
    const unreadCount = await prisma.notification.count({
      where: {
        userId: currentUserId,
        isRead: false
      }
    })

    const notificationsData = notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      content: n.content,
      link: n.link,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString()
    }))

    return NextResponse.json({
      success: true,
      data: {
        notifications: notificationsData,
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '获取通知失败'
    logger.error('获取通知列表失败', error)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
