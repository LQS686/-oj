/**
 * /api/admin/ai/models/[id] - AI 模型单条操作（管理员）
 *
 * PUT    更新模型
 * DELETE 删除模型
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { deleteAiModel, updateAiModel } from '@/lib/ai/service'

/**
 * PUT /api/admin/ai/models/[id]
 */
export const PUT = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
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
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  await deleteAiModel(id)
  return ok({})
})
