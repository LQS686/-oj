/**
 * /api/admin/ai/models/[id]/reset-health - 重置模型健康度（Task 38.5）
 *
 * POST 调 resetModelHealth(modelId)
 * 清空 healthStatus + 更新 lastHealthCheckAt
 * 返回 { success: true, data: { reset: true } }
 *
 * 鉴权：管理员（withApi.admin）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { resetModelHealth } from '@/lib/ai/service'

export const POST = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')
  const result = await resetModelHealth(id)
  return ok(result)
})
