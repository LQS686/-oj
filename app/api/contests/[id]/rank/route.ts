import { withApi, ok, throw400, throw404, resolveViewerFromRequest } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { checkContestAccess } from '@/lib/contest-auth'
import { computeContestRankings } from '@/lib/contest/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id: contestId } = ctx.params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  const viewer = await resolveViewerFromRequest(req)
  const jwtForAccess = viewer
    ? {
        userId: viewer.user.id,
        role: viewer.user.role,
        email: '',
        username: '',
        tokenVersion: viewer.tokenVersion,
      }
    : null
  const access = await checkContestAccess(contestId!, jwtForAccess, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  const viewerRole = viewer?.user.role
  const result = await computeContestRankings(contestId!, {
    viewerRole,
    viewerUserId: viewer?.user.id,
  })
  if (!result) throw404('竞赛不存在')
  return ok(result)
})
