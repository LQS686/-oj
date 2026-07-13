/**
 * POST /api/admin/ai/providers/[id]/discover-models - 发现 AI 服务商模型
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { discoverProviderModels } from '@/lib/ai/discover'

export const POST = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')
  const models = await discoverProviderModels(id)
  return ok(models)
})
