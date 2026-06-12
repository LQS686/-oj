/**
 * /api/solutions/[id]/like - 切换题解点赞
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { toggleSolutionLike, loadSolutionViewUser } from '@/lib/solution/service'
import { isObjectId } from '@/lib/api/validation'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题解ID')

  const q = readQuery<{ isAssignmentContext?: string }>(req)
  const isAssignmentContext = q.isAssignmentContext === 'true'

  const viewer = await loadSolutionViewUser(req)

  try {
    const result = await toggleSolutionLike(id, isAssignmentContext, user.id, viewer)
    return ok({
      data: result,
      message: result.liked ? '点赞成功' : '已取消点赞',
    })
  } catch (err: any) {
    if (err?.status === 403) {
      return Response.json(
        { ok: false, success: false, error: err.message, permission: err.permission, code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    if (err?.status === 404) throw404(err.message)
    if (err?.status === 503) {
      return Response.json(
        { ok: false, success: false, error: err.message, code: 'SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }
    throw err
  }
})
