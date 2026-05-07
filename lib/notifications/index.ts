/**
 * 通知工具库
 * 统一管理通知创建和推送
 */

import { prisma } from '@/lib/prisma'
import { emitNotification } from '@/lib/websocket/server'
import { logger } from '@/lib/logger'

export interface NotificationData {
  userId: string
  type: string
  title: string
  content: string
  link?: string | null
}

/**
 * 创建通知并推送
 */
export async function createNotification(
  data: NotificationData
): Promise<void> {
  // 创建数据库通知记录
  await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      link: data.link || null,
      isRead: false,
    }
  })

  // 实时推送WebSocket通知
  emitNotification(data.userId, {
    type: 'info',
    title: data.title,
    message: data.content
  })

  logger.info(`通知已创建并推送: ${data.title} -> 用户 ${data.userId}`)
}

/**
 * 批量创建通知并推送
 */
export async function createNotifications(
  notifications: NotificationData[]
): Promise<void> {
  if (notifications.length === 0) return

  // 批量创建数据库通知记录
  await prisma.notification.createMany({
    data: notifications.map(data => ({
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      link: data.link || null,
      isRead: false,
    }))
  })

  // 批量推送WebSocket通知
  notifications.forEach(data => {
    emitNotification(data.userId, {
      type: 'info',
      title: data.title,
      message: data.content
    })
  })

  logger.info(`批量通知已创建并推送: ${notifications.length} 条`)
}
