/**
 * /api/rankings/my-rank - 当前用户的实时排名
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { getMyRankAdvanced } from '@/lib/ranking/service'

export const GET = withApi.auth(async (req, _ctx, { user }) => {
  const q = readQuery<{ type?: string }>(req)
  const type = q.type === 'solved' ? 'solved' : 'rating'
  const data = await getMyRankAdvanced(user.id, type)
  return ok(data)
})
