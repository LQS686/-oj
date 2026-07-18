import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/* ============================================================================
 * 用户端可用模型 + 偏好（原 /api/ai/models）
 * ========================================================================== */

/** 列出当前用户可见的 AI 模型（按 name 升序 + 自动 enrich provider） */
export async function listActiveAiModelsForUser() {
  const allModels = await prisma.aiModel.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  const providerIds = Array.from(new Set(allModels.map(m => m.providerId)))
  const providers =
    providerIds.length === 0
      ? []
      : await prisma.aiProvider.findMany({
          where: { id: { in: providerIds }, isActive: true },
          select: { id: true, name: true, slug: true },
        })
  const providerMap = new Map(providers.map(p => [p.id, p]))
  const models = allModels
    .filter(m => providerMap.has(m.providerId))
    .map(m => ({
      id: m.id,
      name: m.name,
      model: m.model,
      type: m.type,
      providerName: providerMap.get(m.providerId)!.name,
      providerSlug: providerMap.get(m.providerId)!.slug,
      maxTokens: m.maxTokens,
      temperature: m.temperature,
      // Task 38.2：暴露 healthStatus 供前端展示健康度徽章
      healthStatus: m.healthStatus,
      // Task 37.2/35.5：暴露 pricePerMillionTokens 供前端展示 + 模型管理页编辑
      pricePerMillionTokens: m.pricePerMillionTokens,
    }))
  const orphanCount = allModels.length - models.length
  if (orphanCount > 0) {
    logger.warn(`[ai/models user] 过滤孤儿/挂载在已禁用 Provider 上的模型 ${orphanCount} 条`)
  }
  return { models, orphanCount }
}

/** 当前用户的 AI 偏好 */
export async function listUserAiPreferences(userId: string) {
  return prisma.userAiPreference.findMany({
    where: { userId },
    orderBy: { lastUsed: 'desc' },
  })
}

/** 读 AI model（用于偏好 upsert 前校验） */
export async function getAiModelById(modelId: string) {
  return prisma.aiModel.findUnique({ where: { id: modelId } })
}

/** 取消用户的 default 偏好（仅清 isDefault 标志） */
export async function unsetUserDefaultAiPreference(userId: string) {
  return prisma.userAiPreference.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  })
}

/** Upsert 用户对某 AI model 的偏好（lastUsed + count++） */
export async function upsertUserAiPreference(input: {
  userId: string
  modelId: string
  isDefault: boolean | undefined
}) {
  return prisma.userAiPreference.upsert({
    where: { userId_modelId: { userId: input.userId, modelId: input.modelId } },
    update: {
      lastUsed: new Date(),
      count: { increment: 1 },
      isDefault: input.isDefault !== undefined ? input.isDefault : undefined,
    },
    create: {
      userId: input.userId,
      modelId: input.modelId,
      count: 1,
      lastUsed: new Date(),
      isDefault: input.isDefault || false,
    },
  })
}
