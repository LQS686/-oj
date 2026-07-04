/**
 * /api/admin/ai/solution/status - 题解生成任务状态查询（前端轮询用）
 *
 * GET /api/admin/ai/solution/status?logId=xxx
 *   返回题解生成任务的状态（PENDING / PROCESSING / COMPLETED / FAILED）
 */
import { withApi, ok, throw400, notFound } from '@/lib/api/withApi'
import { getSolutionJobStatus } from '@/lib/ai/solution-queue'

/**
 * GET /api/admin/ai/solution/status?logId=xxx
 *
 * 返回值（透传 getSolutionJobStatus）：
 *   - status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
 *   - content?: 成功时附带题解 markdown 内容
 *   - error?: 失败时附带错误信息
 *   - solutionId?: 成功时附带题解 ID
 */
export const GET = withApi.admin(async (req, _ctx, _auth) => {
  const { searchParams } = new URL(req.url)
  const logId = searchParams.get('logId')

  if (!logId) {
    throw400('BAD_REQUEST', 'logId 必填')
  }

  // getSolutionJobStatus 在 log 不存在时会抛 Error；这里捕获并映射为 404，
  // 便于前端区分「日志不存在」与「服务器异常」。其他异常重新抛出，
  // 由 withApi 的 safeCall 统一记录日志并返回 500。
  try {
    return ok(await getSolutionJobStatus(logId))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询失败'
    if (message.includes('不存在')) {
      return notFound(message)
    }
    throw error
  }
})
