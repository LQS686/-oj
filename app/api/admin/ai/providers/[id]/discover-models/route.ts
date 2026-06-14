/**
 * POST /api/admin/ai/providers/[id]/discover-models - 发现 AI 服务商模型
 */
import { withApi, ok, throw403, throw400 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'
import { discoverProviderModels } from '@/lib/ai/discover'

export const POST = withApi.auth(withPermission('admin.access')(async (_req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')
  const models = await discoverProviderModels(id)
  return ok(models)
}))
