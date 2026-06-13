/**
 * POST /api/ai/preference - AI 偏好 upsert
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import {
  getAiModelById,
  unsetUserDefaultAiPreference,
  upsertUserAiPreference,
} from '@/lib/ai/service'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ modelId: string; isDefault?: boolean }>(req)
  const { modelId, isDefault } = body

  if (!modelId) throw400('MISSING_MODEL_ID', 'Missing modelId')

  // 校验 model 存在
  const model = await getAiModelById(modelId)
  if (!model) throw404('Model not found')

  // 设为 default 时，先取消其他 default
  if (isDefault) {
    await unsetUserDefaultAiPreference(user.id)
  }

  const pref = await upsertUserAiPreference({ userId: user.id, modelId, isDefault })
  return ok(pref)
})
