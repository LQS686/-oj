/**
 * GET /api/contests/[id]/rank - 获取竞赛排行榜
 *
 * 迁移到 withApi 中间件模式（业务逻辑保持等价）
 *
 * 封榜机制：
 *   - 普通用户在封榜期间拿到的是 sealRankTime 之前的快照（isFrozenView=true）
 *   - 管理员/创建者绕过封榜，看实时数据
 *   - 响应附带 seal 状态对象供前端展示横幅
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'
import { computeContestRankings } from '@/lib/contest/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id: contestId } = ctx.params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  // 验证访问权限
  const currentUser = getUserFromRequest(req)
  const access = await checkContestAccess(contestId!, currentUser, req)
  if (!access.allowed) {
    // 借助 ApiError 抛出对应 status
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  // 传入查看者角色，便于 rankings.ts 内部决定是否绕过封榜
  const viewerRole = currentUser?.role
  const result = await computeContestRankings(contestId!, { viewerRole })
  if (!result) throw404('竞赛不存在')
  return ok(result)
})
