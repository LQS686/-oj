/**
 * /api/admin/ai/models/[id] - AI 模型单条操作（管理员）
 *
 * PUT    更新模型
 * DELETE 删除模型
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

/**
 * PUT /api/admin/ai/models/[id]
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
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

  const existing = await prisma.aiModel.findUnique({ where: { id } })
  if (!existing) throw404('Model not found')

  const updatedModel = await prisma.aiModel.update({
    where: { id },
    data: {
      name,
      model,
      providerId,
      type,
      maxTokens,
      temperature,
      timeout,
      // 高级参数（DeepSeek v4 thinking / topP 等），允许为空对象
      params: (modelParams && typeof modelParams === 'object' ? modelParams : {}) as any,
      isActive: isActive !== undefined ? isActive : existing!.isActive,
    },
  })

  return ok({ data: updatedModel })
})

/**
 * DELETE /api/admin/ai/models/[id]
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  await prisma.aiModel.delete({
    where: { id },
  })

  return ok({})
})
