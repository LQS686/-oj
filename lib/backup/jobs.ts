/**
 * lib/backup/jobs.ts
 * 内存中的备份任务进度注册表。
 *
 * 备份为后台任务：POST 创建任务后立即返回 jobId，前端轮询 GET 进度。
 * 之所以放内存而非数据库：备份目录本身已持久化文件；进度只是瞬时状态。
 * 单进程常驻（本项目为纯 Node standalone server）即可满足。
 */
import { randomBytes } from 'crypto'
import { logger } from '@/lib/logger'

export type BackupJobStatus = 'running' | 'done' | 'error'

export interface BackupJob {
  jobId: string
  status: BackupJobStatus
  /** 阶段：prep / dump / uploads / pack / done */
  stage: string
  /** 0-100 */
  pct: number
  message: string
  createdAt: number
  finishedAt?: number
  fileName?: string
  sizeBytes?: number
  error?: string
}

const jobs = new Map<string, BackupJob>()

export function createJob(message = '准备中'): BackupJob {
  const jobId = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const job: BackupJob = {
    jobId,
    status: 'running',
    stage: 'prep',
    pct: 0,
    message,
    createdAt: Date.now(),
  }
  jobs.set(jobId, job)
  return job
}

export function updateJob(
  jobId: string,
  patch: Partial<Omit<BackupJob, 'jobId' | 'createdAt'>>
): void {
  const job = jobs.get(jobId)
  if (!job) return
  Object.assign(job, patch)
}

export function finishJob(
  jobId: string,
  patch: Partial<Omit<BackupJob, 'jobId' | 'createdAt'>>
): void {
  const job = jobs.get(jobId)
  if (!job) return
  Object.assign(job, patch, { status: 'done', finishedAt: Date.now(), stage: 'done', pct: 100 })
}

export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId)
  if (!job) return
  Object.assign(job, {
    status: 'error',
    stage: 'error',
    pct: job.pct,
    error,
    finishedAt: Date.now(),
  })
  logger.error(`[backup] 备份任务失败：${jobId}`, { error })
}

export function getJob(jobId: string): BackupJob | undefined {
  return jobs.get(jobId)
}

/** 清理长时间无引用的已完成/失败任务，防止内存泄漏。 */
export function pruneJobs(maxAgeMs = 24 * 3600 * 1000): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - (job.finishedAt ?? job.createdAt) > maxAgeMs) {
      jobs.delete(id)
    }
  }
}

/** 当前是否有备份任务在跑（单任务互斥）。 */
export function hasRunningJob(): boolean {
  for (const job of jobs.values()) if (job.status === 'running') return true
  return false
}
