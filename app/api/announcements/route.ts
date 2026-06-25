/**
 * GET /api/announcements — 公开系统公告（首页）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { toInt } from '@/lib/api/validation'
import { listPublicAnnouncements } from '@/lib/announcement/service'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ limit?: string }>(req)
  let limit = toInt(q.limit, 'limit', 8)
  if (limit < 1) limit = 8
  if (limit > 20) limit = 20
  const items = await listPublicAnnouncements(limit)
  return ok({ items })
})