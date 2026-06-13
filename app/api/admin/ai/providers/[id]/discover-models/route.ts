/**
 * POST /api/admin/ai/providers/[id]/discover-models - 发现 AI 服务商模型
 */
import { withApi, ok, throw403, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { discoverProviderModels } from '@/lib/ai/discover'

export const POST = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')
  const models = await discoverProviderModels(id)
  return ok({ data: models })
})
