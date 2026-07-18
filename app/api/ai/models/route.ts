/**
 * GET /api/ai/models - AI 模型（用户端）
 *
 * 返回：所有可用模型 + 当前用户偏好 + 默认 modelId
 * Task 37.2：模型列表含 isRecommended 字段（基于近 30 天成功率）
 * Task 38.2：模型列表含 healthStatus 字段（degraded/down 状态）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getUserFromRequest } from '@/lib/auth'
import {
  listActiveAiModelsForUser,
  listUserAiPreferences,
  getModelRecommendations,
} from '@/lib/ai/service'

export const GET = withApi.public(async (req) => {
  const user = getUserFromRequest(req)

  // 1) 模型 + provider enrich（含 healthStatus + pricePerMillionTokens）
  const { models } = await listActiveAiModelsForUser()

  // Task 37.2：获取模型推荐列表（基于近 30 天成功率 >= 80%）
  const recommendations = await getModelRecommendations(user?.userId).catch(() => [])
  const recommendedIds = new Set(
    recommendations.filter(r => r.isRecommended).map(r => r.modelId)
  )

  // 注入 isRecommended 字段
  const modelsWithRecommendation = models.map((m: any) => ({
    ...m,
    isRecommended: recommendedIds.has(m.id),
  }))

  // 2) 当前用户偏好（若已登录）
  let preferences: any[] = []
  let defaultModelId: string | null = null

  if (user) {
    const all = await listUserAiPreferences(user.userId)
    preferences = all.filter((p: any) => modelsWithRecommendation.some((m: any) => m.id === p.modelId))

    // 优先：用户显式 default 且 model 仍存在
    const defaultPref = preferences.find((p) => p.isDefault)
    if (defaultPref) {
      defaultModelId = defaultPref.modelId
    } else {
      // Task 37.4：用户无偏好时默认选中推荐模型
      const recommendedModel = modelsWithRecommendation.find((m: any) => m.isRecommended)
      if (recommendedModel) {
        defaultModelId = recommendedModel.id
      } else {
        // 其次：最后一次使用且 model 仍存在
        const lastUsedValid = preferences.find((p: any) => modelsWithRecommendation.some((m: any) => m.id === p.modelId))
        if (lastUsedValid) defaultModelId = lastUsedValid.modelId
      }
    }
  }

  return ok({
    models: modelsWithRecommendation,
    preferences: preferences.map((p) => ({
      modelId: p.modelId,
      lastUsed: p.lastUsed,
      count: p.count,
      isDefault: p.isDefault,
    })),
    defaultModelId,
  })
})
