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

export async function listNotifications(filter: NotificationFilter) {
  const where: any = { userId: filter.userId }
  if (filter.unreadOnly) where.isRead = false
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: filter.userId, isRead: false } }),
  ])
  return { items, total, unreadCount }
}

export async function createNotification(data: {
  userId: string
  type: string
  title: string
  content: string
  link?: string
}) {
  return prisma.notification.create({ data })
}

export async function markRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  })
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
}

export async function deleteNotification(id: string, userId: string) {
  return prisma.notification.deleteMany({ where: { id, userId } })
}

export async function getUnreadCount(userId: string): Promise<number> {
  return cache.get('notification:unread', [userId], async () => {
    return prisma.notification.count({ where: { userId, isRead: false } })
  }, { ttl: 30_000 })
}
