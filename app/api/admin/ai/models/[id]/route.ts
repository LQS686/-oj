/**
 * /api/admin/ai/models/[id] - AI 模型单条操作（管理员）
 *
 * PUT    更新模型
 * DELETE 删除模型
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'
import { deleteAiModel, updateAiModel } from '@/lib/ai/service'

/**
 * PUT /api/admin/ai/models/[id]
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{
    name?: string
    model?: string
    providerId?: string
    type?: string
    maxTokens?: number
    temperature?: number
    timeout?: number
    isActive?: boolean
    params?: Record<string, unknown>
  }>(req)
  const {
    name, model, providerId, type,
    maxTokens, temperature, timeout, isActive, params: modelParams,
  } = body

  const updatedModel = await updateAiModel(id, {
    name, model, providerId, type,
    maxTokens, temperature, timeout, isActive,
    params: modelParams,
  })

  return ok(updatedModel)
})

/**
 * DELETE /api/admin/ai/models/[id]
 */
export const DELETE = withApi.auth(withPermission('admin.access')(async (_req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  await deleteAiModel(id)
  return ok({})
}))
