/**
 * GET /api/ai/models - AI 模型（用户端）
 *
 * 返回：所有可用模型 + 当前用户偏好 + 默认 modelId
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getUserFromRequest } from '@/lib/auth'
import { listActiveAiModelsForUser, listUserAiPreferences } from '@/lib/ai/service'

export const GET = withApi.public(async (req) => {
  const user = getUserFromRequest(req)

  // 1) 模型 + provider enrich
  const { models } = await listActiveAiModelsForUser()

  // 2) 当前用户偏好（若已登录）
  let preferences: any[] = []
  let defaultModelId: string | null = null

  if (user) {
    const all = await listUserAiPreferences(user.userId)
    preferences = all.filter((p) => models.some((m) => m.id === p.modelId))

    // 优先：用户显式 default 且 model 仍存在
    const defaultPref = preferences.find((p) => p.isDefault)
    if (defaultPref) {
      defaultModelId = defaultPref.modelId
    } else {
      // 其次：最后一次使用且 model 仍存在
      const lastUsedValid = preferences.find((p) => models.some((m) => m.id === p.modelId))
      if (lastUsedValid) defaultModelId = lastUsedValid.modelId
    }
  }

  return ok({
    models,
    preferences: preferences.map((p) => ({
      modelId: p.modelId,
      lastUsed: p.lastUsed,
      count: p.count,
      isDefault: p.isDefault,
    })),
    defaultModelId,
  })
})
