/**
 * POST /api/ai/preference - AI 偏好
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ modelId: string; isDefault?: boolean }>(req)
  const { modelId, isDefault } = body

  if (!modelId) throw400('MISSING_MODEL_ID', 'Missing modelId')

  // Check if model exists
  const model = await prisma.aiModel.findUnique({ where: { id: modelId } })
  if (!model) throw404('Model not found')

  // Handle "Set as Default" - unset others first if setting true
  if (isDefault) {
    await prisma.userAiPreference.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    })
  }

  // Upsert preference
  const pref = await prisma.userAiPreference.upsert({
    where: { userId_modelId: { userId: user.id, modelId } },
    update: {
      lastUsed: new Date(),
      count: { increment: 1 },
      isDefault: isDefault !== undefined ? isDefault : undefined,
    },
    create: {
      userId: user.id,
      modelId,
      count: 1,
      lastUsed: new Date(),
      isDefault: isDefault || false,
    },
  })

  return ok(pref)
})
