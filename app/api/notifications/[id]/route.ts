/**
 * PUT /api/notifications/[id] - 标记通知为已读
 * DELETE /api/notifications/[id] - 删除通知
 * 迁移到 withApi.auth 模式
 */
import { withApi, readQuery, ok, throw404, throw400 } from '@/lib/api/withApi'
import { markRead, deleteNotification } from '@/lib/notification/service'
import { validateObjectId } from '@/lib/api/validation'

export const PUT = withApi.auth(async (_req, ctx, { user }) => {
  const id = validateObjectId(ctx.params.id, 'notificationId')
  const notification = await markRead(id, user.id)
  if (notification.count === 0) throw throw404('通知不存在')
  return ok({ id, isRead: true })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const id = validateObjectId(ctx.params.id, 'notificationId')
  await deleteNotification(id, user.id)
  return ok({ id, deleted: true })
})
