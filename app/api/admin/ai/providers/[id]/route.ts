/**
 * /api/admin/ai/providers/[id] - AI 服务商单条操作（管理员）
 *
 * PUT    更新服务商
 * DELETE 删除服务商（级联删除挂载的模型）
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  deleteAiProviderCascade,
  updateAiProvider,
} from '@/lib/ai/service'

/**
 * PUT /api/admin/ai/providers/[id]
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{
    name?: string
    baseUrl?: string
    apiKey?: string
    isActive?: boolean
  }>(req)
  const { name, baseUrl, apiKey, isActive } = body

  const provider = await updateAiProvider(id, { name, baseUrl, apiKey, isActive })
  return ok(provider)
})

/**
 * DELETE /api/admin/ai/providers/[id]
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // 级联删除：先删除该服务商下的所有模型，再删除服务商本身
  const result = await deleteAiProviderCascade(id)
  return ok(result)
})
