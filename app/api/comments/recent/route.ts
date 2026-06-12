/**
 * /api/comments/recent - 最新评论（公开）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { toInt } from '@/lib/api/validation'
import { listRecentPublishedComments } from '@/lib/post/service'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ limit?: string }>(req)
  const limit = toInt(q.limit, 'limit', 5)
  const comments = await listRecentPublishedComments(limit)
  return ok(comments)
})
