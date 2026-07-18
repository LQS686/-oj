/**
 * /api/admin/ai/generate - AI 题目生成（管理员）
 *
 * GET  查日志列表 / 单条日志状态
 *      Query 参数：
 *        - logId: 指定则返回单条详情
 *        - mode:  按任务模式过滤（parametric / test_data / analyze / suggest_metadata / similar / diagnose）
 *                 不传 mode 时返回全部历史
 * POST 入队生成任务
 */
import { withApi, ok, readJson } from '@/lib/api/withApi'
import {
  enqueueAiGeneration,
  getAiLogById,
  listUserAiTasks,
  retryAiGeneration,
  validateAiGenerateBody,
  type AiGenerateBody,
} from '@/lib/ai/service'

/**
 * GET /api/admin/ai/generate
 *   无 logId -> 返回当前用户任务列表（可按 mode 过滤）
 *   有 logId -> 返回单条
 */
export const GET = withApi.admin(async (req, _ctx, { user }) => {
  const { searchParams } = new URL(req.url)
  const logId = searchParams.get('logId')

  if (!logId) {
    const mode = searchParams.get('mode') || undefined
    return ok(await listUserAiTasks(user.id, { mode }))
  }
  return ok(await getAiLogById(logId))
})

/**
 * POST /api/admin/ai/generate
 */
export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<AiGenerateBody>(req)
  const { retryFromLogId, reduceTemperature } = body

  // 3. Retry path: 从已失败日志重跑
  if (retryFromLogId) {
    return ok(await retryAiGeneration(user.id, retryFromLogId, reduceTemperature))
  }

  validateAiGenerateBody(body)
  return ok(await enqueueAiGeneration(user.id, body))
})
