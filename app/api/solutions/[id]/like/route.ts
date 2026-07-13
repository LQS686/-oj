/**
 * /api/solutions/[id]/like - 切换题解点赞
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { toggleSolutionLike, loadSolutionViewUser } from '@/lib/solution/service'
import { isObjectId } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
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
    logger.error('切换题解点赞失败', err)
    if (err?.status === 403) {
      return Response.json(
        { ok: false, success: false, error: '无权操作', permission: err.permission, code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    if (err?.status === 404) throw404('资源不存在')
    if (err?.status === 503) {
      return Response.json(
        { ok: false, success: false, error: '服务暂时不可用', code: 'SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }
    throw err
  }
})
