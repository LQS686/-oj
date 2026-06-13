/**
 * /api/admin/ai/providers/[id] - AI 服务商单条操作（管理员）
 *
 * PUT    更新服务商
 * DELETE 删除服务商（级联删除挂载的模型）
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * PUT /api/admin/ai/providers/[id]
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
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

  const existing = await prisma.aiProvider.findUnique({ where: { id } })
  if (!existing) throw404('Provider not found')

  const data: any = {
    name,
    baseUrl: baseUrl || null,
    isActive: isActive !== undefined ? isActive : existing!.isActive,
  }

  // Update API key only if provided and not masked
  if (apiKey && !apiKey.includes('****')) {
    data.apiKey = encrypt(apiKey)
  } else if (apiKey === '') {
    data.apiKey = null
  }

  const provider = await prisma.aiProvider.update({
    where: { id },
    data,
  })

  // 级联处理：当 isActive 从 true 变为 false 时，软删除挂载在该 Provider 上的所有 model
  // 这样可以避免出现"挂在已禁用 Provider 上的活跃 model"这种孤儿数据。
  // 反向（false → true）不做处理，model 的 isActive 状态由用户在「AI 模型管理」页手动恢复。
  if (
    isActive === false &&
    existing!.isActive === true
  ) {
    const cascaded = await prisma.aiModel.updateMany({
      where: { providerId: id, isActive: true },
      data: { isActive: false },
    })
    if (cascaded.count > 0) {
      logger.info(
        `[ai/providers] 服务商 ${id} 被禁用，级联软删除 ${cascaded.count} 个挂载模型`,
      )
    }
  }

  return ok({ data: provider })
})

/**
 * DELETE /api/admin/ai/providers/[id]
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // 级联删除：先删除该服务商下的所有模型，再删除服务商本身
  // 避免在 MongoDB 无外键约束时留下指向不存在 Provider 的孤儿 model
  const deletedModels = await prisma.aiModel.deleteMany({
    where: { providerId: id },
  })

  await prisma.aiProvider.delete({
    where: { id },
  })

  if (deletedModels.count > 0) {
    logger.info(`[ai/providers] 级联删除服务商 ${id}，连带删除 ${deletedModels.count} 个模型`)
  }

  return ok({ deletedModels: deletedModels.count })
})
