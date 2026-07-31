/**
 * 题目统计：状态分布、语言分布、AC 率、近 7 天趋势、AC 平均耗时/内存
 * GET /api/problems/[id]/stats
 *
 * URL 参数 [id] 支持 ObjectId 或 problemNumber。
 * 访问权与题目详情一致：非公开题不可枚举统计。
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { getProblemStats } from '@/lib/problem/stats'
import { requireAccessibleProblem } from '@/lib/problem/access'
import { getUserFromRequest } from '@/lib/auth'
import { getCachedUser } from '@/lib/api/handler'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  const session = getUserFromRequest(req)
  const viewer = session?.userId
    ? await getCachedUser(session.userId, session.tokenVersion)
    : null

  const contestId = req.nextUrl.searchParams.get('contestId') || undefined
  const problem = await requireAccessibleProblem(id, viewer, { contestId })
  const stats = await getProblemStats(problem.id, { contestId, viewer })
  if (!stats) throw400('INVALID_ID', '题目不存在')

  return ok(stats)
})
