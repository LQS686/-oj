/**
 * GET /api/contests/[id]/problems - 获取竞赛题目列表
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'
import { listContestProblemsWithStatus } from '@/lib/contest/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const currentUser = getUserFromRequest(req)
  const access = await checkContestAccess(id!, currentUser, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  return ok(await listContestProblemsWithStatus(id!, currentUser?.userId || null))
})
