/**
 * /api/rankings - 排行榜（按解题数，支持总/月/周/日榜）
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { listRankingByPeriod, type RankingPeriod } from '@/lib/ranking/service'
import { toInt } from '@/lib/api/validation'

const PERIODS: RankingPeriod[] = ['total', 'month', 'week', 'day']

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ period?: string; type?: string; page?: string; limit?: string }>(req)
  // 兼容旧参数 type=solved / rating：solved 映射到 total，rating 不再支持（评分体系已移除）
  const periodRaw = PERIODS.includes(q.period as RankingPeriod)
    ? (q.period as RankingPeriod)
    : q.type === 'solved'
      ? 'total'
      : 'total'

  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit, 'limit', 50)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  const data = await listRankingByPeriod(periodRaw, page, limit)
  return ok(data)
})
