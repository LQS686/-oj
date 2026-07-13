/**
 * /api/admin/problems/[id]/verification-logs - 题目的验证日志（管理员）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { listProblemVerificationLogs } from '@/lib/admin/logs'

export const GET = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const data = await listProblemVerificationLogs(id)
  return ok(data)
})
