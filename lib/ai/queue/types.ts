import type { GenerationParams } from '../generator';

interface AiJob {
  logId: string
  userId: string
  params: GenerationParams
}

/**
 * User-level rate limit (P1)
 *   同 solution-queue：每个用户 10 分钟内最多 3 次入队。
 *   防止单用户刷大量 AI 出题任务。
 */
const AI_USER_LIMIT_WINDOW_MS = 10 * 60 * 1000
const AI_USER_LIMIT_MAX = 3

type JobStatus = 'waiting' | 'active' | 'completed' | 'failed'

interface QueuedJob {
  id: string
  data: AiJob
  status: JobStatus
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  /**
   * 超时标志：executeJob 用 Promise.race 实现超时，但 _executeJobInner 的 Promise
   * 无法真正取消。超时后 catch 设置 aborted=true，_executeJobInner 在关键写库点
   * （status='COMPLETED' 之前）检查此标志并 return，避免把已被 catch 标为 FAILED
   * 的日志状态覆盖回 COMPLETED。
   */
  aborted: boolean
}

export type {
  AiJob,
  JobStatus,
  QueuedJob,
}

export {
  AI_USER_LIMIT_WINDOW_MS,
  AI_USER_LIMIT_MAX,
}
