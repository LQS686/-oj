/**
 * POST /api/notifications/mark-all-read - 标记所有通知为已读
 */
import { withApi, ok } from '@/lib/api/withApi'
import { markAllRead } from '@/lib/notification/service'

export const POST = withApi.auth(async (_req, _ctx, { user }) => {
  const result = await markAllRead(user.id)
  return ok({ modifiedCount: result.count })
})
