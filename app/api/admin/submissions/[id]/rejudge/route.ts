/**
 * POST /api/admin/submissions/[id]/rejudge
 * 管理员重测指定提交
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { rejudgeSubmission } from '@/lib/submission/service'

export const POST = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')
  const data = await rejudgeSubmission(id)
  return ok(data)
})
