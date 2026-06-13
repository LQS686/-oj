/**
 * /api/admin/ai/generate - AI 题目生成（管理员）
 *
 * GET  查日志列表 / 单条日志状态
 * POST 入队生成任务
 */
import { withApi, ok, readJson, throw403 } from '@/lib/api/withApi'
import {
  enqueueAiGeneration,
  getAiLogById,
  listRecentAiLogs,
  retryAiGeneration,
  validateAiGenerateBody,
  type AiGenerateBody,
} from '@/lib/ai/service'

/**
 * GET /api/admin/ai/generate
 *   无 logId -> 返回当前用户最近 20 条
 *   有 logId -> 返回单条
 */
export const GET = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }

  const { searchParams } = new URL(req.url)
  const logId = searchParams.get('logId')

  if (!logId) {
    return ok({ data: await listRecentAiLogs(user.id, 20) })
  }
  return ok({ data: await getAiLogById(logId) })
})

/**
 * POST /api/admin/ai/generate
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }

  const body = await readJson<AiGenerateBody>(req)
  const { retryFromLogId, reduceTemperature } = body

  // 3. Retry path: 从已失败日志重跑
  if (retryFromLogId) {
    return ok({ data: await retryAiGeneration(user.id, retryFromLogId, reduceTemperature) })
  }

  validateAiGenerateBody(body)
  return ok({ data: await enqueueAiGeneration(user.id, body) })
})
