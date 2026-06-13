/**
 * GET /api/ai/models - AI 模型（用户端）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'

// This endpoint is for normal users to get available models and their own preferences
export const GET = withApi.public(async (req) => {
  const user = getUserFromRequest(req)

  // 使用两步查询避免 MongoDB 在 include 孤儿引用时抛 500：
  //   1) 仅拉取 isActive=true 的 models
  //   2) 拉取这些 models 引用的 providers（同时要求 provider isActive=true）
  //   3) 过滤掉 provider 不存在或 provider.isActive=false 的 models
  //   4) 手动 enrich 后返回
  const allModels = await prisma.aiModel.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  const providerIds = Array.from(new Set(allModels.map((m) => m.providerId)))
  const providers =
    providerIds.length === 0
      ? []
      : await prisma.aiProvider.findMany({
          where: { id: { in: providerIds }, isActive: true },
          select: { id: true, name: true, slug: true },
        })
  const providerMap = new Map(providers.map((p) => [p.id, p]))

  const models = allModels
    .filter((m) => providerMap.has(m.providerId))
    .map((m) => ({
      id: m.id,
      name: m.name,
      model: m.model,
      type: m.type,
      providerName: providerMap.get(m.providerId)!.name,
      providerSlug: providerMap.get(m.providerId)!.slug,
      maxTokens: m.maxTokens,
      temperature: m.temperature,
    }))

  const orphanCount = allModels.length - models.length
  if (orphanCount > 0) {
    logger.warn(`[ai/models user] 过滤孤儿/挂载在已禁用 Provider 上的模型 ${orphanCount} 条`)
  }

  // If user is logged in, get their preferences
  let preferences: any[] = []
  let defaultModelId: string | null = null

  if (user) {
    preferences = await prisma.userAiPreference.findMany({
      where: { userId: user.userId },
      orderBy: { lastUsed: 'desc' },
    })

    // 仅当 default 指向当前仍存在的 model 时才采用，否则视为无 default
    const defaultPref = preferences.find(
      (p) => p.isDefault && models.some((m) => m.id === p.modelId)
    )
    if (defaultPref) {
      defaultModelId = defaultPref.modelId
    } else {
      const lastUsedValid = preferences.find((p) => models.some((m) => m.id === p.modelId))
      if (lastUsedValid) {
        defaultModelId = lastUsedValid.modelId
      }
    }
  }

  return ok({
    models,
    preferences: preferences
      .filter((p) => models.some((m) => m.id === p.modelId)) // 过滤掉指向不存在 model 的偏好
      .map((p) => ({
        modelId: p.modelId,
        lastUsed: p.lastUsed,
        count: p.count,
        isDefault: p.isDefault,
      })),
    defaultModelId,
  })
})
