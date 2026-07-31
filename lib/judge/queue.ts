// 简化版评测队列系统（基于内存队列，适合开发/小规模使用）
// 生产环境建议使用 BullMQ + Redis
// Linux-only：任务超时必须 abort 并杀掉选手进程树，避免占槽位后仍空转。

import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import type { ResultState, ComparisonMode } from './types'
import {
  getJudgeConfig,
  registerJudgeQueueRuntimeApplier,
} from './config'

// 评测任务数据类型
export interface JudgeJob {
  submissionId: string
  problemId: string
  userId: string
  code: string
  language: string
  timeLimit: number
  memoryLimit: number
  comparisonMode?: ComparisonMode    // 输出比较模式，默认 'default'
  realPrecision?: number             // 浮点数比较精度，默认 3
  /** Testlib checker 源码（comparisonMode=special-judge 时必填） */
  spjCode?: string | null
  rejudgeTimes?: number              // 临界 TLE 重测次数，默认 0（关闭）
  extraTimeRatio?: number            // 临界 TLE 容差比例，默认 0
  testCases: Array<{
    id: string
    /** 可为空：正式评测由 judger 按 id 懒加载，避免队列持有全部大测点 */
    input: string
    output: string
    score: number
    timeLimit?: number               // 单测点时间限制覆盖
    memoryLimit?: number             // 单测点内存限制覆盖
  }>
}

// 评测结果类型
export interface JudgeResult {
  submissionId: string
  status: ResultState
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  message?: string
  testResults?: Array<{
    testId: string
    status: ResultState
    time: number
    memory: number
    message?: string
  }>
  judgedAt?: Date
}

// 任务状态
type JobStatus = 'waiting' | 'active' | 'completed' | 'failed'

export interface QueuedJob {
  id: string
  data: JudgeJob
  status: JobStatus
  result?: JudgeResult
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

class JudgeQueue extends EventEmitter {
  private queue: QueuedJob[] = []
  private processing: Map<string, QueuedJob> = new Map()
  private completed: Map<string, QueuedJob> = new Map()
  private maxConcurrent: number = 1
  private jobTimeoutMs: number = 300_000
  private deadCheckMs: number = 5_000
  private isProcessing: boolean = false
  private deadJobChecker: NodeJS.Timeout | null = null
  /** 活跃任务 AbortController：超时/取消时真正中止 executeJudge 与选手进程 */
  private abortControllers = new Map<string, AbortController>()
  /** 精确到点的任务级超时定时器（比周期扫描更及时） */
  private jobTimeoutTimers = new Map<string, NodeJS.Timeout>()

  constructor(maxConcurrent?: number) {
    super()
    const cfg = getJudgeConfig()
    this.maxConcurrent = maxConcurrent ?? cfg.maxConcurrent
    this.jobTimeoutMs = cfg.jobTimeoutMs
    this.deadCheckMs = cfg.deadCheckMs
    this.startDeadJobChecker()
  }

  /** 后台保存系统设置后热更新并发/超时/扫描间隔 */
  applyRuntimeConfig(patch: {
    maxConcurrent: number
    jobTimeoutMs: number
    deadCheckMs: number
  }) {
    const prev = {
      maxConcurrent: this.maxConcurrent,
      jobTimeoutMs: this.jobTimeoutMs,
      deadCheckMs: this.deadCheckMs,
    }
    this.maxConcurrent = Math.min(16, Math.max(1, patch.maxConcurrent))
    this.jobTimeoutMs = Math.min(3_600_000, Math.max(30_000, patch.jobTimeoutMs))
    this.deadCheckMs = Math.min(30_000, Math.max(2_000, patch.deadCheckMs))
    if (prev.deadCheckMs !== this.deadCheckMs) {
      this.startDeadJobChecker()
    }
    // 并发升高时立刻尝试调度等待中的任务
    if (this.maxConcurrent > prev.maxConcurrent) {
      this.scheduleProcess()
    }
    logger.info('评测队列运行时配置已更新', {
      prev,
      next: {
        maxConcurrent: this.maxConcurrent,
        jobTimeoutMs: this.jobTimeoutMs,
        deadCheckMs: this.deadCheckMs,
      },
    })
  }

  private startDeadJobChecker() {
    if (this.deadJobChecker) {
      clearInterval(this.deadJobChecker)
      this.deadJobChecker = null
    }
    this.deadJobChecker = setInterval(() => this.checkDeadJobs(), this.deadCheckMs)
    this.deadJobChecker.unref?.()
  }

  private clearJobGuards(jobId: string) {
    const timer = this.jobTimeoutTimers.get(jobId)
    if (timer) {
      clearTimeout(timer)
      this.jobTimeoutTimers.delete(jobId)
    }
    this.abortControllers.delete(jobId)
  }

  private armJobGuards(job: QueuedJob): AbortSignal {
    this.clearJobGuards(job.id)
    const ac = new AbortController()
    this.abortControllers.set(job.id, ac)
    const timeoutMs = this.jobTimeoutMs
    const timer = setTimeout(() => {
      this.failDeadJob(job, `评测超时（超过 ${timeoutMs / 1000}s）`)
    }, timeoutMs)
    // unref：避免仅因超时定时器阻止进程退出
    timer.unref?.()
    this.jobTimeoutTimers.set(job.id, timer)
    return ac.signal
  }

  /**
   * 强制失败并 abort 在跑进程。
   * 旧实现只改状态不杀进程，会导致孤儿评测占满 CPU、后续任务排队更久。
   */
  private failDeadJob(job: QueuedJob, errorMsg: string) {
    if (job.status !== 'active') return
    logger.warn(`检测到死任务，强制中止并标记失败`, {
      jobId: job.id,
      startedAt: job.startedAt,
      error: errorMsg,
    })
    const ac = this.abortControllers.get(job.id)
    try {
      ac?.abort(errorMsg)
    } catch {
      /* ignore */
    }
    this.clearJobGuards(job.id)
    try {
      job.status = 'failed'
      job.error = errorMsg
      job.completedAt = new Date()
      this.processing.delete(job.id)
      this.completed.set(job.id, job)
      this.emit('failed', job, new Error(errorMsg))
    } catch (e) {
      logger.error(`清理死任务时出错`, e, { jobId: job.id })
    }
    this.scheduleProcess()
  }

  // 死任务检测（备份）：定时器漏触发时仍能 abort + 释放槽位
  private checkDeadJobs() {
    const now = Date.now()
    const timeoutMs = this.jobTimeoutMs
    const deadJobs: QueuedJob[] = []
    for (const job of this.processing.values()) {
      if (job.startedAt && now - job.startedAt.getTime() > timeoutMs) {
        deadJobs.push(job)
      }
    }
    for (const job of deadJobs) {
      this.failDeadJob(job, `评测超时（超过 ${timeoutMs / 1000}s）`)
    }
  }

  // 清理资源（关闭死任务检测定时器），供 Worker 退出时调用
  dispose() {
    if (this.deadJobChecker) {
      clearInterval(this.deadJobChecker)
      this.deadJobChecker = null
    }
    for (const timer of this.jobTimeoutTimers.values()) {
      clearTimeout(timer)
    }
    this.jobTimeoutTimers.clear()
    for (const ac of this.abortControllers.values()) {
      try {
        ac.abort('queue-disposed')
      } catch {
        /* ignore */
      }
    }
    this.abortControllers.clear()
  }

  /** 事件驱动调度：有空位且有等待任务时启动，避免 100ms 忙等空转 */
  private scheduleProcess() {
    if (this.isProcessing) return
    if (this.queue.length === 0) return
    if (this.processing.size >= this.maxConcurrent) return
    this.scheduleProcess()
  }

  // 添加任务到队列
  async add(data: JudgeJob): Promise<string> {
    const job: QueuedJob = {
      id: data.submissionId,
      data,
      status: 'waiting',
      createdAt: new Date(),
    }

    this.queue.push(job)
    this.emit('waiting', job.id)
    
    logger.info(`任务已加入队列`, { jobId: job.id, queueLength: this.queue.length })
    
    this.scheduleProcess()

    return job.id
  }

  // 处理队列：一次填满空闲槽位后退出；任务结束时再 scheduleProcess
  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
        const job = this.queue.shift()
        if (!job) break
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        const signal = this.armJobGuards(job)

        this.emit('active', job)
        logger.info(`开始评测`, { jobId: job.id })

        // 异步执行评测（不等待）；结束后释放槽位并继续调度
        this.executeJob(job, signal)
          .catch((error: Error) => {
            logger.error(`评测执行错误`, error, { jobId: job.id })
            this.clearJobGuards(job.id)
            if (job.status === 'failed' || job.status === 'completed') return
            try {
              job.status = 'failed'
              job.error = error instanceof Error ? error.message : String(error)
              job.completedAt = new Date()
              this.processing.delete(job.id)
              this.completed.set(job.id, job)
              this.emit('failed', job, error)
            } catch (e) {
              logger.error(`补全失败状态时出错`, e, { jobId: job.id })
            }
          })
          .finally(() => {
            this.scheduleProcess()
          })
      }
    } finally {
      this.isProcessing = false
      if (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
        this.scheduleProcess()
      }
    }
  }
  
  // 执行单个评测任务
  private async executeJob(job: QueuedJob, signal: AbortSignal) {
    try {
      // 导入评测逻辑
      const { executeJudge } = await import('./judger')

      // 执行评测（传入 job-level AbortSignal，超时可杀进程树）
      const result = await executeJudge(job.data, { signal })

      this.clearJobGuards(job.id)

      // 竞态保护：若 job 已被 checkDeadJobs 标记为 failed/completed，
      // 则不再覆盖状态、不从 processing 删除、不重复 emit，直接返回结果。
      if (job.status === 'failed' || job.status === 'completed') {
        logger.warn(`任务已被标记为 ${job.status}（可能被死任务检测器处理），跳过完成回调`, { jobId: job.id })
        return
      }

      // 标记完成
      job.status = 'completed'
      job.result = result
      job.completedAt = new Date()

      this.processing.delete(job.id)
      this.completed.set(job.id, job)

      this.emit('completed', job, result)
      logger.info(`评测完成`, { jobId: job.id, status: result.status })

      // 清理旧的已完成任务（保留最近100个）
      if (this.completed.size > 100) {
        const oldestKey = this.completed.keys().next().value as string | undefined
        if (oldestKey) {
          this.completed.delete(oldestKey)
        }
      }
    } catch (error) {
      this.clearJobGuards(job.id)
      // 竞态保护：若 job 已被 checkDeadJobs 标记为 failed/completed，
      // 则不覆盖状态、不重复 emit（避免数据库被多次更新）
      if (job.status === 'failed' || job.status === 'completed') {
        logger.warn(`任务已被标记为 ${job.status}（可能被死任务检测器处理），跳过失败回调`, { jobId: job.id })
        return
      }
      // 标记失败
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : String(error)
      job.completedAt = new Date()

      this.processing.delete(job.id)
      this.completed.set(job.id, job)

      this.emit('failed', job, error)
      logger.error(`评测失败`, error, { jobId: job.id })
    }
  }

  // 获取任务状态
  async getJob(jobId: string): Promise<QueuedJob | null> {
    // 检查等待队列
    const waiting = this.queue.find(j => j.id === jobId)
    if (waiting) return waiting

    // 检查处理中
    const active = this.processing.get(jobId)
    if (active) return active

    // 检查已完成
    const completed = this.completed.get(jobId)
    if (completed) return completed

    return null
  }

  // 获取队列统计
  getStats() {
    return {
      waiting: this.queue.length,
      active: this.processing.size,
      completed: this.completed.size,
      total: this.queue.length + this.processing.size,
    }
  }

  // 取消任务（等待中直接移除；执行中 abort 进程树并标失败）
  async cancel(jobId: string): Promise<boolean> {
    // 从等待队列中移除
    const index = this.queue.findIndex(j => j.id === jobId)
    if (index !== -1) {
      this.queue.splice(index, 1)
      logger.info(`任务已取消`, { jobId })
      return true
    }

    const active = this.processing.get(jobId)
    if (active && active.status === 'active') {
      this.failDeadJob(active, '评测已取消')
      return true
    }

    return false
  }

  // 清空队列
  async drain() {
    this.queue = []
    logger.info('队列已清空')
  }
}

// 导出单例实例（使用全局变量确保在 Next.js 开发模式下也是同一个实例）
declare global {
  var __judgeQueue: JudgeQueue | undefined
}

export const judgeQueue = global.__judgeQueue ?? new JudgeQueue()

if (!global.__judgeQueue) {
  global.__judgeQueue = judgeQueue
}

registerJudgeQueueRuntimeApplier((patch) => {
  judgeQueue.applyRuntimeConfig(patch)
})

// 辅助函数
export async function addJudgeJob(data: JudgeJob): Promise<string> {
  const cfg = getJudgeConfig()
  // 注入当前生效默认值（未显式指定时使用）
  const enrichedData: JudgeJob = {
    ...data,
    extraTimeRatio: data.extraTimeRatio ?? cfg.extraTimeRatio,
    rejudgeTimes: data.rejudgeTimes ?? cfg.rejudgeTimes,
  }
  return judgeQueue.add(enrichedData)
}

export async function getJobStatus(jobId: string) {
  const job = await judgeQueue.getJob(jobId)
  if (!job) return null

  return {
    id: job.id,
    state: job.status,
    data: job.data,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  }
}

export async function getQueueStats() {
  return judgeQueue.getStats()
}

export default judgeQueue
