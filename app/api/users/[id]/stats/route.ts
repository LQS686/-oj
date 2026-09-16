/**
 * /api/users/[id]/stats - 获取用户统计
 */
import { withApi, ok, throw400, throw404, resolveViewerFromRequest } from '@/lib/api/withApi'
import { getUserFullStats } from '@/lib/user/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的用户ID')
  // 传入访问者：他人主页的 recentSubmissions 需按可见性/封榜过滤（本人不过滤）
  const viewer = await resolveViewerFromRequest(req)
  const data = await getUserFullStats(id, viewer?.user.id ?? null)
  if (!data) throw404('用户不存在')
  return ok(data)
})
