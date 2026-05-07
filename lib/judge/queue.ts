// 简化版评测队列系统（基于内存队列，适合开发/小规模使用）
// 生产环境建议使用 BullMQ + Redis

import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'

// 评测任务数据类型
export interface JudgeJob {
  submissionId: string
  problemId: string
  userId: string
  code: string
  language: string
  timeLimit: number
  memoryLimit: number
  testCases: Array<{
    id: string
    input: string
    output: string
    score: number
    timeLimit?: number
    memoryLimit?: number
  }>
}

// 评测结果类型
export interface JudgeResult {
  submissionId: string
  status: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE' | 'Judging' | 'Pending'
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  message?: string
  testResults?: Array<{
    testId: string
    status: string
    time: number
    memory: number
    message?: string
  }>
  judgedAt?: Date
}

// 任务状态
type JobStatus = 'waiting' | 'active' | 'completed' | 'failed'

interface QueuedJob {
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

  constructor(maxConcurrent: number = 3) {
    super()
    this.maxConcurrent = maxConcurrent
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
        const job = this.queue.shift()!
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        
        this.emit('active', job)
        logger.info(`开始评测`, { jobId: job.id })
        
        // 异步执行评测（不等待）
        this.executeJob(job).catch((error: Error) => {
          logger.error(`评测执行错误`, error, { jobId: job.id })
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

export const judgeQueue = global.__judgeQueue ?? new JudgeQueue(3)

if (!global.__judgeQueue) {
  global.__judgeQueue = judgeQueue
}

// 辅助函数
export async function addJudgeJob(data: JudgeJob): Promise<string> {
  return judgeQueue.add(data)
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
