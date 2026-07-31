import { withApi, ok, throw400, resolveViewerFromRequest } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { checkContestAccess } from '@/lib/contest-auth'
import { listContestProblemsWithStatus } from '@/lib/contest/service'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

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
  const access = await checkContestAccess(id!, jwtForAccess, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  return ok(
    await listContestProblemsWithStatus(
      id!,
      viewer?.user.id || null,
      viewer?.user.role
    )
  )
})
