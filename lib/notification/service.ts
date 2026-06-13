/**
 * lib/notification/service.ts
 * 通知 CRUD、已读标记
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE } from '@/lib/types/common'

export interface NotificationFilter {
  userId: string
  unreadOnly?: boolean
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
  return { items, total, unreadCount, page, pageSize }
}

export async function createNotification(data: {
  userId: string
  type: string
  title: string
  content: string
  link?: string
}) {
  const result = await prisma.notification.create({ data })
  clearNotificationCache(data.userId)
  return result
}

export async function clearNotificationCache(userId: string) {
  cache.delete(`notification:unread:${userId}`)
}

export async function markRead(id: string, userId: string) {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  })
  clearNotificationCache(userId)
  return result
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
  clearNotificationCache(userId)
  return result
}

export async function deleteNotification(id: string, userId: string) {
  const result = await prisma.notification.deleteMany({ where: { id, userId } })
  clearNotificationCache(userId)
  return result
}

export async function getUnreadCount(userId: string): Promise<number> {
  return cache.get('notification:unread', [userId], async () => {
    return prisma.notification.count({ where: { userId, isRead: false } })
  }, { ttl: 30_000 })
}
