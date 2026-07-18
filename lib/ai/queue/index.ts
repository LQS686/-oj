import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import { startPreviewCleanup } from '../preview-cleanup'
import type { GenerationParams } from '../generator';
import { generateProblems, computePromptHashForParams } from '../generator'
import { prisma } from '@/lib/prisma'
// 保留原始 import 表面（即使本文件不再直接使用 computePromptHash / inferCoveredDimensions）
// 以便后续若需在 index 层做 quality-check / prompt-hash 调试可立即使用
import { computePromptHash } from '../prompt-hash'
import { scoreTestdataStrength, inferCoveredDimensions } from '../quality-check'
import type { GeneratedProblem } from '../prompts/core/types'

import type { AiJob, QueuedJob } from './types'
import { AI_USER_LIMIT_WINDOW_MS, AI_USER_LIMIT_MAX } from './types'
import {
  calculateAndStoreCost,
  updateModelHealthOnFailure,
  autoEnqueueDiagnose,
} from './utils'
import { dispatchByMode } from './handlers'
import type { JobExecutionContext } from './handlers/types'

// Re-export queue 内部类型，便于上层（service / route）类型标注复用
export type { AiJob, QueuedJob, JobStatus } from './types'
// Re-export utils 以保持与原 queue.ts 相同的模块表面（即使外部暂未使用）
export {
  calculateAndStoreCost,
  updateModelHealthOnFailure,
  autoEnqueueDiagnose,
} from './utils'

// problemNumber 竞态修复：unique 冲突时重试
// client 参数可选：传入事务 tx 时使用 tx，否则使用默认 prisma 客户端
export async function createProblemWithRetry(
  data: any,
  maxRetries = 3,
  client: any = prisma
): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.problem.create({ data })
    } catch (e: any) {
      if (e?.code === 'P2002' && attempt < maxRetries - 1) {
        // unique 冲突，重新查询最大 problemNumber
        const latest = await client.problem.findFirst({
          where: { problemNumber: { startsWith: 'P' } },
          orderBy: { createdAt: 'desc' },
          select: { problemNumber: true },
        })
        let nextNum = 1001
        if (latest?.problemNumber) {
          const match = latest.problemNumber.match(/^P(\d+)$/)
          if (match) {
            nextNum = parseInt(match[1], 10) + 1
          }
        }
        data.problemNumber = `P${nextNum}`
        logger.warn(`[problemNumber] unique 冲突，重试 ${attempt + 1}/${maxRetries}`, { nextNum: data.problemNumber })
        continue
      }
      throw e
    }
  }
  // 理论上不可达（循环要么 return 要么 throw）
  throw new Error('createProblemWithRetry: exhausted retries')
}

class AiQueue extends EventEmitter {
  private queue: QueuedJob[] = []
  private processing: Map<string, QueuedJob> = new Map()
  private maxConcurrent: number = 2 // Limit concurrent AI requests
  private isProcessing: boolean = false

  constructor() {
    super()
  }

  /**
   * 暴露队列运行时状态，供管理端监控接口读取
   * 不抛异常：队列空时返回全 0（maxConcurrent 仍返回当前配置值）
   */
  getStatus(): { waiting: number; active: number; maxConcurrent: number } {
    return {
      waiting: this.queue.length,
      active: this.processing.size,
      maxConcurrent: this.maxConcurrent,
    }
  }

  async add(data: AiJob): Promise<string> {
    // P1：User-level rate limit（防止单用户刷大量 AI 出题任务）
    // 仅统计 PENDING / PROCESSING 任务：已结束（COMPLETED / FAILED / DISCARDED）不占用资源，不应阻塞新提交
    const since = new Date(Date.now() - AI_USER_LIMIT_WINDOW_MS)
    const recentCount = await prisma.aiGenerationLog.count({
      where: {
        userId: data.userId,
        createdAt: { gte: since },
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    })
    if (recentCount >= AI_USER_LIMIT_MAX) {
      throw new Error(
        `AI 出题生成频率过高，请稍后再试（${AI_USER_LIMIT_WINDOW_MS / 60000} 分钟内最多 ${AI_USER_LIMIT_MAX} 次并发任务）`
      )
    }

    const job: QueuedJob = {
      id: data.logId,
      data,
      status: 'waiting',
      createdAt: new Date(),
      aborted: false,
    }

    this.queue.push(job)
    this.emit('waiting', job.id)
    
    if (!this.isProcessing) {
      this.processQueue()
    }

    return job.id
  }

  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0 || this.processing.size > 0) {
      while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
        const job = this.queue.shift()
        if (!job) break
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        
        this.executeJob(job).catch((error) => {
          logger.error(`AI Task Error: ${job.id}`, error)
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isProcessing = false
  }

  private async executeJob(job: QueuedJob) {
    const AI_JOB_TIMEOUT_MS = parseInt(process.env.AI_JOB_TIMEOUT_MS || '300000', 10) // 默认 5 分钟
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      // 主逻辑包装为 Promise.race + 超时，避免 AI 任务长时间挂起阻塞队列
      await Promise.race([
        this._executeJobInner(job),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI 任务执行超时')), AI_JOB_TIMEOUT_MS)
        })
      ])
    } catch (error: any) {
      // 标记 aborted，让 _executeJobInner 在后续写库点跳过 COMPLETED 覆盖
      job.aborted = true
      job.status = 'failed'
      job.error = error.message

      // 透传 AI_PARSE_FAILED 错误代码到日志，让前端能识别并友好提示
      const isParseError = error?.code === 'AI_PARSE_FAILED'
      const errorMessage = isParseError
        ? `AI 返回格式异常：${error.message}。建议：重试 / 切换模型 / 降低 temperature`
        : error.message

      // Update DB with error
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: errorMessage,
          result: isParseError ? {
            parseFailed: true,
            parseInfo: error?.info || null,
            originalContent: error?.info?.originalContent
          } as any : undefined
        }
      })

      // Phase 6 Task 30.4: 自动入队诊断任务（diagnose 模式自身失败不再递归诊断）
      const jobMode = job.data.params.mode
      if (jobMode !== 'diagnose') {
        const modelId = job.data.params.modelId
        const promptHash = (job.data.params as any)._promptHash
        // 异步触发，不阻塞 catch 块
        autoEnqueueDiagnose(job.id, job.data.userId, errorMessage, jobMode, modelId, promptHash).catch(() => {})
      }

      // Phase 6 Task 38.1: 更新模型健康状态（仅 API/超时类错误）
      updateModelHealthOnFailure(job.data.params.modelId, errorMessage).catch(() => {})
    } finally {
      // 确保 processing Map 总是被清理（即使超时或异常）
      if (timeoutId) clearTimeout(timeoutId)
      this.processing.delete(job.id)
    }
  }

  private async _executeJobInner(job: QueuedJob) {
    // 1. Update DB status to PROCESSING
    await prisma.aiGenerationLog.update({
      where: { id: job.id },
      data: { status: 'PROCESSING' }
    })

    // === Phase 6 Task 39.2: 计算并持久化 promptHash ===
    // 仅对走 generateProblems 的 mode 计算（analyze/suggest_metadata/diagnose 有独立 prompt）
    const generationMode = job.data.params.mode
    if (
      generationMode === 'parametric' ||
      generationMode === 'test_data' ||
      generationMode === 'similar' ||
      generationMode === 'test_data_incremental'
    ) {
      try {
        const promptHash = computePromptHashForParams(job.data.params)
        // 暂存到 job.data.params._promptHash，供 catch 块的 autoEnqueueDiagnose 读取
        ;(job.data.params as any)._promptHash = promptHash
        // 持久化到 log.params（合并已有字段，非阻塞）
        const existingLog = await prisma.aiGenerationLog.findUnique({
          where: { id: job.id },
          select: { params: true },
        })
        const existingParams = (existingLog?.params as Record<string, unknown>) || {}
        await prisma.aiGenerationLog.update({
          where: { id: job.id },
          data: { params: { ...existingParams, promptHash } as any },
        })
      } catch (e) {
        // promptHash 计算失败不阻塞主流程
        logger.warn('[ai-queue] promptHash 计算失败', { logId: job.id, err: e })
      }
    }

    // 2. Call generateProblems（仅对走生成类 pipeline 的 mode；analyze / suggest_metadata / diagnose 有独立路径）
    // 注：testCases 不初始化为 []，保留 generateProblems 返回的 undefined 语义，
    //     以匹配原 _executeJobInner 中 `&& testCases` 真值守卫的行为
    let problems: GeneratedProblem[] = []
    let testCases: any[] | undefined
    let thought: string | undefined
    let tokensUsed: number = 0
    let qualityIssues: any
    const mode = job.data.params.mode
    if (mode !== 'analyze' && mode !== 'suggest_metadata' && mode !== 'diagnose') {
      const result = await generateProblems(job.data.params, job.data.userId)
      problems = result.problems
      testCases = result.testCases
      thought = result.thought
      tokensUsed = result.tokensUsed
      qualityIssues = result.qualityIssues
    }

    // 3. Build shared context and dispatch to mode-specific handler
    const ctx: JobExecutionContext = {
      job,
      problems,
      testCases,
      thought,
      tokensUsed,
      qualityIssues,
      stats: {
        total: 0,
        passed: 0,
        failed: 0,
        avgTime: 0,
        avgMemory: 0,
      },
    }
    await dispatchByMode(ctx)
  }
}

// Global instance
declare global {
  var __aiQueue: AiQueue | undefined
}

export const aiQueue = global.__aiQueue ?? new AiQueue()

if (!global.__aiQueue) {
  global.__aiQueue = aiQueue
}

// Phase 6 Task 27.6: 启动预览任务定时清理（幂等，global flag 防止热重载重复注册）
// 放在 aiQueue 初始化之后，确保 prisma 等依赖已就绪
// 注：startPreviewCleanup 内部使用 dynamic import 调用 service.cleanupStalePreviewTasks，
//     避免循环依赖（service.ts → queue.ts → preview-cleanup.ts → service.ts）
startPreviewCleanup()

export async function addAiJob(data: AiJob) {
  return aiQueue.add(data)
}
