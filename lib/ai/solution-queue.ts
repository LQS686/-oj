/**
 * AI 题解生成队列
 *
 * 与 lib/ai/queue.ts 同款 EventEmitter 实现，专门处理题解生成。
 * - 入队：创建 AiGenerationLog (PENDING)，然后入队
 * - 处理：调用 generateSolutionForProblem，成功后写入 Solution 记录
 *   （isAiGenerated=true / isOfficial=true / sourceType=AI_OFFICIAL）
 * - 任意并发（不限制 maxConcurrent）
 *
 * 注意：本队列不复用 aiQueue，因为题解生成是不同业务，写入目标是 Solution 而非 Problem。
 *       AiGenerationLog 是两个队列共享的状态表，但 result 字段结构不同。
 */

import { EventEmitter } from 'events'
import { logger } from '../logger'
import { prisma } from '../prisma'
import { generateSolutionForProblem, SolutionGenerationParams } from './solution-generator'

/**
 * 入队参数
 *
 * - authorId: 题目创建者（写入 Solution.authorId）
 * - triggeredBy: 触发 AI 调用的用户（写入 AiGenerationLog.userId），默认 = authorId
 * - stdCode / stdLang 可选：若未提供，AI 将基于题目描述自行设计算法
 */
export interface EnqueueSolutionParams extends SolutionGenerationParams {
  /** 触发 AI 调用的用户（用于 AiGenerationLog 归属与 AI 配置解析），默认 = authorId */
  triggeredBy?: string
}

interface SolutionJob {
  logId: string
  triggeredBy: string
  authorId: string
  params: SolutionGenerationParams
}

type JobStatus = 'waiting' | 'active' | 'completed' | 'failed'

interface QueuedJob {
  id: string
  data: SolutionJob
  status: JobStatus
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

class SolutionQueue extends EventEmitter {
  private queue: QueuedJob[] = []
  private processing: Map<string, QueuedJob> = new Map()
  private isProcessing: boolean = false

  async add(data: SolutionJob): Promise<string> {
    const job: QueuedJob = {
      id: data.logId,
      data,
      status: 'waiting',
      createdAt: new Date()
    }
    this.queue.push(job)
    this.emit('waiting', job.id)
    if (!this.isProcessing) {
      this.processQueue()
    }
    return job.id
  }

  /**
   * 任意并发：每有一个等待中的 job 就立刻起一个 executeJob，
   * 不再像 aiQueue 那样限制 maxConcurrent=2。
   */
  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true
    while (this.queue.length > 0 || this.processing.size > 0) {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        this.executeJob(job).catch((error) => {
          logger.error(`Solution Job Error: ${job.id}`, error)
        })
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    this.isProcessing = false
  }

  private async executeJob(job: QueuedJob) {
    try {
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' }
      })

      logger.info('[solution-queue] 开始 AI 题解生成', {
        logId: job.id,
        problemId: job.data.params.problemId,
        title: job.data.params.title,
        hasStdCode: !!job.data.params.stdCode,
        triggeredBy: job.data.triggeredBy
      })

      const result = await generateSolutionForProblem(
        job.data.params,
        job.data.triggeredBy
      )

      // 写题解前再次确认题目存在（防止题目已被删除）
      const problem = await prisma.problem.findUnique({
        where: { id: job.data.params.problemId },
        select: { id: true, title: true }
      })
      if (!problem) {
        throw new Error(`题目不存在：${job.data.params.problemId}`)
      }

      // 写入 Solution 记录
      // 同题同源的旧 AI 标程题解先删除（保持「同一题目只有一份 AI_OFFICIAL 标程题解」）
      // 注：sourceType / codeLanguage 为 schema 新增字段，当前 Prisma client 可能尚未重新生成，
      //     用 as any 兜底，运行时已支持。
      await prisma.solution.deleteMany({
        where: {
          problemId: problem.id,
          sourceType: 'AI_OFFICIAL'
        } as any
      })

      const solution = await prisma.solution.create({
        data: {
          problemId: problem.id,
          authorId: job.data.authorId,
          title: `AI 标程题解 - ${problem.title}`,
          content: result.content,
          code: job.data.params.stdCode || null,
          codeLanguage: job.data.params.stdLang || result.language || null,
          language: job.data.params.stdLang || result.language || null,
          isOfficial: true,
          isAiGenerated: true,
          sourceType: 'AI_OFFICIAL'
        } as any
      })

      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: {
            solutionId: solution.id,
            problemId: problem.id,
            content: result.content,
            language: result.language || job.data.params.stdLang || null,
            tokensUsed: result.tokensUsed
          } as any,
          tokensUsed: result.tokensUsed
        }
      })

      logger.info('[solution-queue] AI 题解生成完成', {
        logId: job.id,
        problemId: problem.id,
        solutionId: solution.id,
        contentLength: result.content.length,
        tokensUsed: result.tokensUsed
      })

      job.status = 'completed'
      job.completedAt = new Date()
      this.processing.delete(job.id)
    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message

      const isParseError = error?.code === 'AI_PARSE_FAILED'
      const errorMessage = isParseError
        ? `AI 返回格式异常：${error.message}。建议：重试 / 切换模型 / 降低 temperature`
        : error.message

      logger.error('[solution-queue] AI 题解生成失败', {
        logId: job.id,
        problemId: job.data.params.problemId,
        code: error?.code,
        message: errorMessage
      })

      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: errorMessage,
          result: isParseError
            ? ({
                parseFailed: true,
                parseInfo: error?.info || null,
                originalContent: error?.info?.originalContent
              } as any)
            : undefined
        }
      })

      this.processing.delete(job.id)
    }
  }
}

// Global singleton — 与 aiQueue 同款模式，避免 dev server 热重载时多实例
declare global {
  // eslint-disable-next-line no-var
  var __solutionQueue: SolutionQueue | undefined
}

export const solutionQueue = global.__solutionQueue ?? new SolutionQueue()
if (!global.__solutionQueue) {
  global.__solutionQueue = solutionQueue
}

/**
 * 入队题解生成任务
 *
 * 流程：
 *  1. 校验必填字段
 *  2. 创建 AiGenerationLog (PENDING)
 *  3. 推入 solutionQueue
 *  4. 返回 logId（用于前端轮询 getSolutionJobStatus）
 */
export async function enqueueSolutionJob(
  params: EnqueueSolutionParams
): Promise<{ logId: string }> {
  if (!params.problemId || !params.title) {
    throw new Error('enqueueSolutionJob: problemId 与 title 必填')
  }
  if (!params.authorId) {
    throw new Error('enqueueSolutionJob: authorId 必填（题目创建者，用于 Solution.authorId）')
  }

  const triggeredBy = params.triggeredBy || params.authorId

  const log = await prisma.aiGenerationLog.create({
    data: {
      userId: triggeredBy,
      status: 'PENDING',
      // 用 params 字段记录题解生成上下文（与题目出题共用 AiGenerationLog 表，
      // 通过 _kind='solution' 区分；不依赖 schema 扩展以保持向后兼容）
      params: {
        _kind: 'solution',
        problemId: params.problemId,
        title: params.title,
        authorId: params.authorId,
        hasStdCode: !!params.stdCode,
        stdLang: params.stdLang || null,
        modelId: params.modelId || null
      } as any
    }
  })

  await solutionQueue.add({
    logId: log.id,
    triggeredBy,
    authorId: params.authorId,
    params: {
      problemId: params.problemId,
      title: params.title,
      description: params.description,
      stdCode: params.stdCode,
      stdLang: params.stdLang,
      modelId: params.modelId,
      authorId: params.authorId
    }
  })

  logger.info('[solution-queue] 题解生成任务入队', {
    logId: log.id,
    problemId: params.problemId,
    triggeredBy
  })

  return { logId: log.id }
}

/**
 * 查询题解生成任务状态
 *
 * 返回值：
 *   - status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
 *   - content?: 成功时附带题解 markdown 内容
 *   - error?: 失败时附带错误信息
 *
 * 若 log 不存在，抛错由调用方处理（route 层映射 404）。
 */
export async function getSolutionJobStatus(
  logId: string
): Promise<{ status: string; content?: string; error?: string; solutionId?: string }> {
  const log = await prisma.aiGenerationLog.findUnique({
    where: { id: logId }
  })
  if (!log) {
    throw new Error(`AiGenerationLog 不存在：${logId}`)
  }

  const result = (log.result as any) || {}

  if (log.status === 'COMPLETED') {
    // 优先用 result.content；若空，再回查最新 AI_OFFICIAL Solution
    let content: string | undefined = result.content
    if (!content && result.solutionId) {
      const sol = await prisma.solution.findUnique({
        where: { id: result.solutionId },
        select: { content: true }
      })
      content = sol?.content
    }
    return {
      status: log.status,
      content,
      solutionId: result.solutionId
    }
  }

  if (log.status === 'FAILED') {
    return {
      status: log.status,
      error: log.error || 'AI 题解生成失败'
    }
  }

  return { status: log.status }
}
