/**
 * AI 题解生成队列
 *
 * 与 lib/ai/queue.ts 同款 EventEmitter 实现，专门处理题解生成。
 * - 入队：创建 AiGenerationLog (PENDING)，然后入队
 * - 处理：调用 generateSolutionForProblem，成功后写入 Solution 记录
 *   （isAiGenerated=true / isOfficial=true / sourceType=AI_OFFICIAL）
 * - 并发受限（maxConcurrent 默认 2，可通过 AI_SOLUTION_MAX_CONCURRENT 环境变量覆盖）
 *
 * 注意：本队列不复用 aiQueue，因为题解生成是不同业务，写入目标是 Solution 而非 Problem。
 *       AiGenerationLog 是两个队列共享的状态表，但 result 字段结构不同。
 */

import { EventEmitter } from 'events'
import { logger } from '../logger'
import { prisma } from '../prisma'
import type { Prisma } from '@prisma/client'
import type { SolutionGenerationParams } from './solution-generator';
import { generateSolutionForProblem } from './solution-generator'

/** 题解生成任务超时时间（默认 5 分钟，可通过 AI_SOLUTION_TIMEOUT_MS 环境变量覆盖） */
const AI_SOLUTION_TIMEOUT_MS = parseInt(process.env.AI_SOLUTION_TIMEOUT_MS || '300000', 10)

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
  /**
   * 超时标志：executeJob 用 Promise.race 实现超时，但 _executeJobInner 的 Promise
   * 无法真正取消。超时后 catch 设置 aborted=true，_executeJobInner 在写库点
   * （写 Solution / status='COMPLETED' 之前）检查此标志并 return，避免覆盖已被
   * catch 标为 FAILED 的日志状态。
   */
  aborted: boolean
}

class SolutionQueue extends EventEmitter {
  private queue: QueuedJob[] = []
  private processing: Map<string, QueuedJob> = new Map()
  /** 最大并发数（默认 2，可通过 AI_SOLUTION_MAX_CONCURRENT 环境变量覆盖） */
  private maxConcurrent = parseInt(process.env.AI_SOLUTION_MAX_CONCURRENT || '2', 10)

  async add(data: SolutionJob): Promise<string> {
    const job: QueuedJob = {
      id: data.logId,
      data,
      status: 'waiting',
      createdAt: new Date(),
      aborted: false
    }
    this.queue.push(job)
    this.emit('waiting', job.id)
    this.processQueue()
    return job.id
  }

  /**
   * 并发受限：最多同时运行 maxConcurrent 个 executeJob。
   * 每完成一个 job 后通过 finally 继续推进队列，无需轮询。
   */
  private async processQueue() {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const job = this.queue.shift()!
      job.status = 'active'
      job.startedAt = new Date()
      this.processing.set(job.id, job)
      this.executeJob(job).catch((error) => {
        logger.error(`Solution Job Error: ${job.id}`, error)
      }).finally(() => {
        // 处理完一个后继续推进队列
        this.processQueue()
      })
    }
  }

  /**
   * executeJob 包装器：在 _executeJobInner 外层加超时保护（默认 5 分钟）。
   * 超时后 Promise.race reject，进入 catch 标记 FAILED（覆盖 Task 11.3 stuck 检测）；
   * processing 在 finally 中统一清理。
   */
  private async executeJob(job: QueuedJob) {
    try {
      await Promise.race([
        this._executeJobInner(job),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('题解生成任务执行超时')),
            AI_SOLUTION_TIMEOUT_MS
          )
        )
      ])
    } catch (error: unknown) {
      // 超时或 _executeJobInner 未捕获异常：标记 FAILED
      // _executeJobInner 内部已 try/catch 并写 FAILED 日志，此处主要兜底超时场景
      // 标记 aborted，让 _executeJobInner 在后续写库点跳过 COMPLETED 覆盖
      const errorMessage = error instanceof Error ? error.message : String(error)
      job.aborted = true
      job.status = 'failed'
      job.error = errorMessage
      logger.error('[solution-queue] 题解生成任务超时或异常', {
        logId: job.id,
        problemId: job.data.params.problemId,
        message: errorMessage
      })
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: errorMessage }
      }).catch(() => {
        // 忽略：可能 _executeJobInner 已更新过日志
      })
    } finally {
      this.processing.delete(job.id)
    }
  }

  private async _executeJobInner(job: QueuedJob) {
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
      // 注：sourceType / codeLanguage 为 schema 新增字段
      // 使用 $transaction 保证 deleteMany + create 原子性，避免中途失败导致题解丢失
      //
      // 超时保护：若 executeJob 已因超时把日志标 FAILED，则跳过写 Solution + COMPLETED 日志，
      // 避免覆盖已被 catch 标记的 FAILED 状态（检查与写库之间无 await，避免竞态）
      if (job.aborted) return
      const solution = await prisma.$transaction(async (tx) => {
        await tx.solution.deleteMany({
          where: {
            problemId: problem.id,
            sourceType: 'AI_OFFICIAL'
          }
        })
        return tx.solution.create({
          data: {
            problemId: problem.id,
            authorId: job.data.authorId,
            title: `AI 标程题解 - ${problem.title}`,
            content: result.content,
            code: job.data.params.stdCode || null,
            codeLanguage: job.data.params.stdLang || result.language || null,
            isOfficial: true,
            isAiGenerated: true,
            sourceType: 'AI_OFFICIAL'
          }
        })
      })

      // 超时保护：事务执行期间若超时触发，跳过 COMPLETED 写库避免覆盖 FAILED
      // （检查与写库之间无 await，避免竞态）
      if (job.aborted) return

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
          } as Prisma.InputJsonValue,
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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      const errObj = (error || {}) as Record<string, unknown>
      const errCode = errObj.code
      const errInfo = errObj.info as Record<string, unknown> | undefined
      job.status = 'failed'
      job.error = errMsg

      const isParseError = errCode === 'AI_PARSE_FAILED'
      const errorMessage = isParseError
        ? `AI 返回格式异常：${errMsg}。建议：重试 / 切换模型 / 降低 temperature`
        : errMsg

      logger.error('[solution-queue] AI 题解生成失败', {
        logId: job.id,
        problemId: job.data.params.problemId,
        code: errCode,
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
                parseInfo: errInfo || null,
                originalContent: errInfo?.originalContent || null
              } as Prisma.InputJsonValue)
            : undefined
        }
      })
    }
  }
}

// Global singleton — 与 aiQueue 同款模式，避免 dev server 热重载时多实例
declare global {
   
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
      params: {
        _kind: 'solution',
        problemId: params.problemId,
        title: params.title,
        authorId: params.authorId,
        hasStdCode: !!params.stdCode,
        stdLang: params.stdLang || null,
        modelId: params.modelId || null
      } as Prisma.InputJsonValue
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

      const result = (log.result as Record<string, unknown>) || {}

  if (log.status === 'COMPLETED') {
    // 优先用 result.content；若空，再回查最新 AI_OFFICIAL Solution
    let content: string | undefined = result.content as string | undefined
    const solutionId = result.solutionId as string | undefined
    if (!content && solutionId) {
      const sol = await prisma.solution.findUnique({
        where: { id: solutionId },
        select: { content: true }
      })
      content = sol?.content
    }
    return {
      status: log.status,
      content,
      solutionId
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
