/**
 * /api/admin/reviews/[id] - 题解审核操作（管理员）
 *
 * PATCH 鉴权（管理员）：通过 / 驳回 / 下架
 */
import { withApi, ok, readJson, throw400, throw404, ApiError } from '@/lib/api/withApi'
import { reviewSolution, type SolutionReviewAction } from '@/lib/solution/service'
import { isObjectId } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

const VALID_ACTIONS = new Set<SolutionReviewAction>(['approve', 'reject', 'hide'])

export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题解ID')

  const body = await readJson<{ action?: string; note?: string }>(req)
  const action = body.action as SolutionReviewAction
  if (!action || !VALID_ACTIONS.has(action)) {
    throw400('VALIDATION', '无效的审核操作')
  }

  try {
    const updated = await reviewSolution(id, action, body.note)
    return ok(updated)
  } catch (err: unknown) {
    logger.error('题解审核失败', err)
    if (err instanceof ApiError && err.status === 404) throw404('题解不存在')
    throw err
  }
})
