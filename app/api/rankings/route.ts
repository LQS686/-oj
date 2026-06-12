/**
 * /api/rankings - 排行榜
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { listRankingByType } from '@/lib/ranking/service'
import { toInt } from '@/lib/api/validation'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ type?: string; page?: string; limit?: string }>(req)
  const typeRaw = q.type === 'solved' ? 'solved' : 'rating'

  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit, 'limit', 50)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  const data = await listRankingByType(typeRaw, page, limit)
  return ok(data)
})
