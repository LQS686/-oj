/**
 * /api/admin/ai/generate/batch - 批量出题（Task 29.2）
 *
 * POST 接受 { topics: string[], difficulty, type, modelId, additionalInfo }
 * 校验 topics.length <= 5，超出报 400
 * 为每个主题独立入队，关联 batchId
 * 返回 { success: true, data: { batchId, logIds } }
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { enqueueBatchGeneration } from '@/lib/ai/service'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await req.json().catch(() => ({}))
  const topics = body?.topics

  if (!Array.isArray(topics) || topics.length === 0) {
    throw400('MISSING_FIELDS', 'topics 必须为非空数组')
  }
  // 校验每个 topic 为非空字符串
  const cleanTopics = topics
    .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t: string) => t.length > 0)
  if (cleanTopics.length === 0) {
    throw400('MISSING_FIELDS', 'topics 不能全为空')
  }
  if (cleanTopics.length > 5) {
    throw400('TOO_MANY_TOPICS', '批量出题最多 5 个主题')
  }

  const result = await enqueueBatchGeneration(
    cleanTopics,
    {
      difficulty: body?.difficulty,
      type: body?.type,
      modelId: body?.modelId,
      additionalInfo: body?.additionalInfo,
    },
    user.id
  )
  return ok(result)
})
