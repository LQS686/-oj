/**
 * GET /api/announcements/[id] — 公开公告详情
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getPublicAnnouncementById } from '@/lib/announcement/service'

export const GET = withApi.public(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的公告 ID')
  const data = await getPublicAnnouncementById(id)
  if (!data) throw404('公告不存在或已过期')
  return ok(data)
})