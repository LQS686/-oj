/**
 * 公共题目详情（按 ObjectId 或 problemNumber 解析）
 * GET /api/problems/[id]
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { getProblemDetailData } from '@/lib/problem/detail'
import { getUserFromRequest } from '@/lib/auth'
import { getCachedUser } from '@/lib/api/handler'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  // 可选登录：公开题无需登录；私有/班级/竞赛题需通过访问校验
  const session = getUserFromRequest(req)
  const viewer = session?.userId
    ? await getCachedUser(session.userId, session.tokenVersion)
    : null
  const contestId = req.nextUrl.searchParams.get('contestId') || undefined

  // 详情组装（含可见性校验 + 实时提交统计）已下沉到 service，供 API 与页面 SSR 共用
  return ok(await getProblemDetailData(id, viewer, contestId))
})
