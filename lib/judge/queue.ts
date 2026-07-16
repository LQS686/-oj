// 简化版评测队列系统（基于内存队列，适合开发/小规模使用）
// 生产环境建议使用 BullMQ + Redis

import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import type { ResultState, ComparisonMode } from './types'

// 评测机默认配置（可通过环境变量覆盖）
const DEFAULT_EXTRA_TIME_RATIO = parseFloat(process.env.JUDGE_EXTRA_TIME_RATIO || '0.1')
const DEFAULT_REJUDGE_TIMES = parseInt(process.env.JUDGE_REJUDGE_TIMES || '1', 10)
const DEFAULT_MAX_CONCURRENT = parseInt(process.env.JUDGE_MAX_CONCURRENT || '1', 10)
const DEFAULT_JOB_TIMEOUT = parseInt(process.env.JUDGE_JOB_TIMEOUT || '300', 10) * 1000

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
  rejudgeTimes?: number              // 临界 TLE 重测次数，默认 0（关闭）
  extraTimeRatio?: number            // 临界 TLE 容差比例，默认 0
  testCases: Array<{
    id: string
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
  private maxConcurrent: number = 3
  private isProcessing: boolean = false
  private deadJobChecker: NodeJS.Timeout | null = null

  constructor(maxConcurrent: number = 3) {
    super()
    this.maxConcurrent = maxConcurrent
    this.deadJobChecker = setInterval(() => this.checkDeadJobs(), 30000)
  }

  // 死任务检测：扫描 processing，对超时未完成的 job 强制标记失败
  private checkDeadJobs() {
    const now = Date.now()
    // 先收集要清理的 job，避免遍历时 delete 导致迭代异常
    const deadJobs: Array<[string, QueuedJob]> = []
    for (const [jobId, job] of this.processing) {
      if (job.startedAt && now - job.startedAt.getTime() > DEFAULT_JOB_TIMEOUT) {
        deadJobs.push([jobId, job])
      }
    }
    for (const [jobId, job] of deadJobs) {
      logger.warn(`检测到死任务，强制标记失败`, { jobId, startedAt: job.startedAt })
      try {
        job.status = 'failed'
        job.error = `评测超时（超过 ${DEFAULT_JOB_TIMEOUT / 1000}s）`
        job.completedAt = new Date()
        this.processing.delete(jobId)
        this.completed.set(jobId, job)
        this.emit('failed', job, new Error('评测超时'))
      } catch (e) {
        logger.error(`清理死任务时出错`, e, { jobId })
      }
    }
  }

  // 清理资源（关闭死任务检测定时器），供 Worker 退出时调用
  dispose() {
    if (this.deadJobChecker) {
      clearInterval(this.deadJobChecker)
      this.deadJobChecker = null
    }
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
    
    // 触发处理
    if (!this.isProcessing) {
      this.processQueue()
    }

    return job.id
  }

  // 处理队列
  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0 || this.processing.size > 0) {
      // 启动新任务（如果有空闲槽位）
      while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
        const job = this.queue.shift()
        if (!job) break
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        
        this.emit('active', job)
        logger.info(`开始评测`, { jobId: job.id })
        
        // 异步执行评测（不等待）
        this.executeJob(job).catch((error: Error) => {
          logger.error(`评测执行错误`, error, { jobId: job.id })
          // 补全：确保 job 不永久占槽位
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
      }

      // 等待一小段时间再检查
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isProcessing = false
  }

  // 执行单个评测任务
  private async executeJob(job: QueuedJob) {
    try {
      // 导入评测逻辑
      const { executeJudge } = await import('./judger')
      
      // 执行评测
      const result = await executeJudge(job.data)

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

  // 取消任务
  async cancel(jobId: string): Promise<boolean> {
    // 从等待队列中移除
    const index = this.queue.findIndex(j => j.id === jobId)
    if (index !== -1) {
      this.queue.splice(index, 1)
      logger.info(`任务已取消`, { jobId })
      return true
    }

    // 无法取消正在执行的任务
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

export const judgeQueue = global.__judgeQueue ?? new JudgeQueue(DEFAULT_MAX_CONCURRENT)

if (!global.__judgeQueue) {
  global.__judgeQueue = judgeQueue
}

// 辅助函数
export async function addJudgeJob(data: JudgeJob): Promise<string> {
  // 注入环境变量默认值（未显式指定时使用）
  const enrichedData: JudgeJob = {
    ...data,
    extraTimeRatio: data.extraTimeRatio ?? DEFAULT_EXTRA_TIME_RATIO,
    rejudgeTimes: data.rejudgeTimes ?? DEFAULT_REJUDGE_TIMES,
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
