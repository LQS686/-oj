/**
 * /api/rankings/my-rank - 当前用户的实时排名（按解题数，支持总/月/周/日榜）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { getMyRankAdvanced, type RankingPeriod } from '@/lib/ranking/service'

const PERIODS: RankingPeriod[] = ['total', 'month', 'week', 'day']

export const GET = withApi.auth(async (req, _ctx, { user }) => {
  const q = readQuery<{ period?: string; type?: string }>(req)
  const period = PERIODS.includes(q.period as RankingPeriod)
    ? (q.period as RankingPeriod)
    : q.type === 'solved'
      ? 'total'
      : 'total'
  const data = await getMyRankAdvanced(user.id, period)
  return ok(data)
})
