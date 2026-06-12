/**
 * GET /api/notifications - 获取通知列表
 * 迁移到 withApi.auth 模式
 */
import { withApi, readQuery, ok } from '@/lib/api/withApi'
import { listNotifications } from '@/lib/notification/service'
import { toInt, toBool } from '@/lib/api/validation'
import { MAX_PAGE_SIZE } from '@/lib/types/common'

export const GET = withApi.auth(async (req, _ctx, { user }) => {
  const q = readQuery(req)
  const page = toInt(q.page, 'page', 1)
  const pageSize = Math.min(toInt(q.pageSize, 'pageSize', 20), MAX_PAGE_SIZE)
  const unreadOnly = toBool(q.unreadOnly)

  const data = await listNotifications(
    { userId: user.id, unreadOnly },
    { page, pageSize }
  )
  return ok(data)
})
