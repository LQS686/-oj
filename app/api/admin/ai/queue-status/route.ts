/**
 * /api/admin/ai/queue-status - AI 队列状态查询（仅 SYSTEM_ADMIN）
 *
 * GET 返回题目生成队列与题解生成队列的运行时状态：
 *   { problemQueue: { waiting, active, maxConcurrent },
 *     solutionQueue: { waiting, active, maxConcurrent } }
 *
 * 队列实例不可用（理论上不会发生，单例始终存在）时对应分支返回全 0，不抛 500。
 */
import { withApi, ok } from '@/lib/api/withApi'
import { aiQueue } from '@/lib/ai/queue'
import { solutionQueue } from '@/lib/ai/solution-queue'

interface QueueStatus {
  waiting: number
  active: number
  maxConcurrent: number
}

const ZERO_STATUS: QueueStatus = { waiting: 0, active: 0, maxConcurrent: 0 }

export const GET = withApi.systemAdmin(async () => {
  let problemQueue: QueueStatus = { ...ZERO_STATUS }
  let solutionQueueStatus: QueueStatus = { ...ZERO_STATUS }

  try {
    problemQueue = aiQueue.getStatus()
  } catch {
    // 队列实例不可用时返回全 0，不崩溃
  }

  try {
    solutionQueueStatus = solutionQueue.getStatus()
  } catch {
    // 队列实例不可用时返回全 0，不崩溃
  }

  return ok({
    problemQueue,
    solutionQueue: solutionQueueStatus,
  })
})
