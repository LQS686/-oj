/**
 * lib/notification/service.ts
 * 通知 CRUD、已读标记、推送
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { emitNotification } from '@/lib/websocket/server'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE } from '@/lib/types/common'

export interface NotificationFilter {
  userId: string
  unreadOnly?: boolean
}

export interface NotificationData {
  userId: string
  type: string
  title: string
  content: string
  link?: string | null
}

export async function listNotifications(
  filter: NotificationFilter,
  options: { page?: number; pageSize?: number } = {}
) {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const where: any = { userId: filter.userId }
  if (filter.unreadOnly) where.isRead = false
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: filter.userId, isRead: false } }),
  ])
  return { items, notifications: items, total, unreadCount, page, pageSize }
}

export async function createNotification(data: NotificationData) {
  const result = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      link: data.link || null,
      isRead: false,
    },
  })
  clearNotificationCache(data.userId)
  const unreadCount = await getUnreadCount(data.userId)
  emitNotification(data.userId, {
    type: 'info',
    title: data.title,
    message: data.content,
    unreadCount,
    id: result.id,
  })
  logger.info(`通知已创建并推送: ${data.title} -> 用户 ${data.userId}`)
  return result
}

export async function createNotifications(notifications: NotificationData[]) {
  if (notifications.length === 0) return
  await prisma.notification.createMany({
    data: notifications.map((data) => ({
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      link: data.link || null,
      isRead: false,
    })),
  })
  const userIds = Array.from(new Set(notifications.map((n) => n.userId)))
  for (const userId of userIds) {
    clearNotificationCache(userId)
  }
  // 按用户推送权威未读数；同用户多条时合并为一次推送（带最新未读）
  for (const userId of userIds) {
    const unreadCount = await getUnreadCount(userId)
    const last = [...notifications].reverse().find((n) => n.userId === userId)!
    emitNotification(userId, {
      type: 'info',
      title: last.title,
      message: last.content,
      unreadCount,
    })
  }
  logger.info(`批量通知已创建并推送: ${notifications.length} 条`)
}

export async function clearNotificationCache(userId: string) {
  cache.delete(CacheKeys.notification.unread(userId))
}

/** 静默同步未读角标（无桌面通知文案） */
async function pushUnreadCount(userId: string) {
  const unreadCount = await getUnreadCount(userId)
  emitNotification(userId, {
    type: 'info',
    title: '',
    message: '',
    unreadCount,
  })
}

export async function markRead(id: string, userId: string) {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  })
  clearNotificationCache(userId)
  void pushUnreadCount(userId).catch(() => {})
  return result
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
  clearNotificationCache(userId)
  void pushUnreadCount(userId).catch(() => {})
  return result
}

export async function deleteNotification(id: string, userId: string) {
  const result = await prisma.notification.deleteMany({ where: { id, userId } })
  clearNotificationCache(userId)
  void pushUnreadCount(userId).catch(() => {})
  return result
}

export async function getUnreadCount(userId: string): Promise<number> {
  return cache.get('notification:unread', [userId], async () => {
    return prisma.notification.count({ where: { userId, isRead: false } })
  }, { ttl: 30_000 })
}
