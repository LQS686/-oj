import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { addAiJob, createProblemWithRetry } from '../queue'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import { AI_GENERATION_COUNT, type AiGenerateBody } from './types'
import { isStuckLog, touchAiModelPreference } from './logs'

/**
 * 重试一条 AI 日志：新建 PENDING 日志 + 入队（沿用原参数，可选降温度）
 */
export async function retryAiGeneration(
  userId: string,
  retryFromLogId: string,
  reduceTemperature?: boolean
) {
  const oldLog = await prisma.aiGenerationLog.findUnique({ where: { id: retryFromLogId } })
  if (!oldLog) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  if (oldLog.userId !== userId) {
    throw new ApiError('FORBIDDEN', 'Forbidden', 403)
  }
  if (oldLog.status === 'COMPLETED') {
    throw new ApiError('ALREADY_COMPLETED', '该日志已成功完成，无需重试', 400)
  }
  // 僵尸日志（dev server 重启后遗留的 PROCESSING 永远完不成）允许重试
  if (!isStuckLog(oldLog) && (oldLog.status === 'PENDING' || oldLog.status === 'PROCESSING')) {
    throw new ApiError('IN_PROGRESS', '该日志正在处理中，请等待完成后再试', 400)
  }

  const retryParams = (oldLog.params as Record<string, string | undefined>) || {}
  logger.info('[ai-generate] Retry from log', { retryFromLogId, userId, reduceTemperature })

  const retryLog = await prisma.aiGenerationLog.create({
    data: {
      userId,
      status: 'PENDING',
      params: {
        ...retryParams,
        _retryFrom: retryFromLogId,
        _reduceTemperature: reduceTemperature ?? true,
      } as Prisma.InputJsonValue,
    },
  })

  await addAiJob({
    logId: retryLog.id,
    userId,
    params: {
      mode: (retryParams.mode as 'parametric' | 'test_data' | 'test_data_incremental' | 'analyze' | 'suggest_metadata' | 'similar' | 'diagnose') || 'parametric',
      type: retryParams.type,
      difficulty: retryParams.difficulty,
      topic: retryParams.topic ? (Array.isArray(retryParams.topic) ? retryParams.topic : [retryParams.topic]) : undefined,
      count: AI_GENERATION_COUNT,
      additionalInfo: retryParams.additionalInfo,
      title: retryParams.title,
      description: retryParams.description,
      inputDescription: retryParams.inputDescription,
      outputDescription: retryParams.outputDescription,
      targetProblemId: retryParams.targetProblemId,
      solutionCode: retryParams.solutionCode,
      solutionLanguage: retryParams.solutionLanguage,
      modelId: retryParams.modelId,
      samples: Array.isArray(retryParams.samples) ? retryParams.samples : undefined,
      problemInput: retryParams.problemInput,
      problemOutput: retryParams.problemOutput,
      _retry: true,
      _reduceTemperature: true,
    },
  })

  return { logId: retryLog.id, retriedFrom: retryFromLogId }
}

/**
 * 校验入参的必填字段（按 mode 分支）
 *
 * Phase 6 Task 33: test_data_incremental 与 test_data 共用同一套校验
 * （title / description 必填，targetProblemId 可选，标程可选）
 */
export function validateAiGenerateBody(body: AiGenerateBody) {
  if (body.mode === 'test_data' || body.mode === 'test_data_incremental') {
    if (!body.title || !body.description) {
      throw new ApiError('MISSING_FIELDS', 'Missing title or description', 400)
    }
    // 标程可选：拆分流程中 AI 在第一阶段已生成 solution_cpp，但部分模型可能未遵守；后端不应阻塞
  } else {
    if (!body.type || !body.difficulty || !body.topic) {
      throw new ApiError('MISSING_FIELDS', 'Missing required fields', 400)
    }
  }
}

/**
 * 创建一条新的 AI 生成任务（PENDING 日志 + 入队）
 */
export async function enqueueAiGeneration(userId: string, body: AiGenerateBody) {
  if (body.modelId) {
    await touchAiModelPreference(userId, body.modelId)
  }

  const log = await prisma.aiGenerationLog.create({
    data: {
      userId,
      status: 'PENDING',
      params: body as unknown as Prisma.InputJsonValue,
    },
  })

  await addAiJob({
    logId: log.id,
    userId,
    params: {
      mode: (body.mode as 'parametric' | 'test_data' | 'test_data_incremental' | 'analyze' | 'suggest_metadata' | 'similar' | 'diagnose') || 'parametric',
      // Parametric
      type: body.type,
      difficulty: body.difficulty,
      topic: body.topic as string[] | undefined,
      count: AI_GENERATION_COUNT,
      additionalInfo: body.additionalInfo,
      // Test Data Gen
      title: body.title,
      description: body.description,
      inputDescription: body.inputDescription,
      outputDescription: body.outputDescription,
      // Common
      targetProblemId: body.targetProblemId,
      solutionCode: body.solutionCode,
      solutionLanguage: body.solutionLanguage,
      modelId: body.modelId,
      // Suggest Metadata（题目元数据建议输入）
      samples: body.samples,
      problemInput: body.problemInput,
      problemOutput: body.problemOutput,
    },
  })

  return { logId: log.id }
}

/* ============================================================================
 * Phase 6：已有功能工作流强化
 * ========================================================================== */

/**
 * Task 27.2: 确认入库预览题目
 *
 * 从 AiGenerationLog.result.previewProblems 读取预览数据，创建 Problem + Solution。
 * 事务保证：所有题目 + 题解原子创建，失败回滚。
 *
 * @param logId AI 生成日志 ID
 * @returns 创建的 problemId 列表
 */
export async function commitPreviewedProblem(logId: string): Promise<{ problemIds: string[] }> {
  const log = await prisma.aiGenerationLog.findUnique({ where: { id: logId } })
  if (!log) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  if (log.status !== 'COMPLETED') {
    throw new ApiError('INVALID_STATUS', `仅 COMPLETED 状态的预览可入库，当前状态：${log.status}`, 400)
  }

  const result = (log.result as Record<string, unknown>) || {}
  const previewProblems = (result.previewProblems as any[]) || []
  if (!previewProblems.length) {
    throw new ApiError('NO_PREVIEW', '该日志没有预览题目可入库', 400)
  }
  if (!result.isPreview) {
    throw new ApiError('NOT_PREVIEW', '该日志不是预览状态，无法入库', 400)
  }

  const problemIds: string[] = []
  const solutionStatuses: Array<{ problemNumber: string; status: 'created' | 'missing'; solutionId?: string }> = []

  // 整个入库过程使用事务包裹：任一题目/题解创建失败则全部回滚，避免半残数据
  // 注：createProblemWithRetry 的 problemNumber unique 冲突重试在事务内仍然安全（重试读最大 problemNumber 也走 tx）
  await prisma.$transaction(async (tx: any) => {
    for (const preview of previewProblems) {
      // 创建 Problem（复用 queue.ts 的 problemNumber 重试逻辑，传入 tx 保证事务一致性）
      const newProblem = await createProblemWithRetry({
        data: {
          problemNumber: preview.problemNumber,
          title: preview.title,
          description: preview.description,
          input: preview.input,
          output: preview.output,
          samples: preview.samples || [],
          hint: preview.hint,
          difficulty: preview.difficulty,
          tags: Array.isArray(preview.tags) ? preview.tags : [],
          timeLimit: preview.timeLimit,
          memoryLimit: preview.memoryLimit,
          isPublic: preview.isPublic,
          visibility: preview.visibility,
          authorId: preview.authorId,
          isAiGenerated: true,
          aiStatus: preview.aiStatus || 'AI_GENERATED',
          aiPrompt: preview.aiPrompt,
          stdCode: preview.stdCode,
          stdLang: preview.stdLang,
          testCases: {
            create: preview.testCases || [],
          },
        },
      }, 3, tx)
      problemIds.push(newProblem.id)

      // 创建 Solution（如有）— 在同一事务内删除旧 AI_OFFICIAL 题解并写入新题解
      let solutionStatus: { problemNumber: string; status: 'created' | 'missing'; solutionId?: string } = {
        problemNumber: preview.problemNumber,
        status: 'missing',
      }

      if (preview.solution && preview.solution.content) {
        await tx.solution.deleteMany({
          where: { problemId: newProblem.id, sourceType: 'AI_OFFICIAL' } as any,
        })
        const solution = await tx.solution.create({
          data: {
            problemId: newProblem.id,
            authorId: preview.authorId,
            title: preview.solution.title,
            content: preview.solution.content,
            code: preview.solution.code || null,
            codeLanguage: preview.solution.codeLanguage || null,
            isOfficial: true,
            isAiGenerated: true,
            sourceType: 'AI_OFFICIAL',
          } as any,
        })
        solutionStatus = {
          problemNumber: preview.problemNumber,
          status: 'created',
          solutionId: solution.id,
        }
      }
      solutionStatuses.push(solutionStatus)
    }
  })

  // 更新 log：标记已入库，保留 previewProblems 供审计
  await prisma.aiGenerationLog.update({
    where: { id: logId },
    data: {
      result: {
        ...(log.result as object),
        isPreview: false,
        committedProblemIds: problemIds,
        solutionStatus: solutionStatuses,
        committedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  })

  logger.info('[ai/service] 预览题目已入库', { logId, problemIds })
  return { problemIds }
}

/**
 * Task 27.3: 丢弃预览题目
 *
 * 标记 log.status = 'DISCARDED'，不创建任何 Problem/Solution。
 */
export async function discardPreviewedProblem(logId: string): Promise<{ discarded: true }> {
  const log = await prisma.aiGenerationLog.findUnique({ where: { id: logId } })
  if (!log) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  if (log.status !== 'COMPLETED') {
    throw new ApiError('INVALID_STATUS', `仅 COMPLETED 状态的预览可丢弃，当前状态：${log.status}`, 400)
  }
  const result = (log.result as Record<string, unknown>) || {}
  if (!result.isPreview) {
    throw new ApiError('NOT_PREVIEW', '该日志不是预览状态，无法丢弃', 400)
  }

  await prisma.aiGenerationLog.update({
    where: { id: logId },
    data: {
      status: 'DISCARDED',
      result: {
        ...(log.result as object),
        isPreview: false,
        discardedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  })

  logger.info('[ai/service] 预览题目已丢弃', { logId })
  return { discarded: true }
}

/**
 * Task 28.1: 入队"相似题生成"任务
 *
 * 读取原题信息作为 prompt 上下文，走与 PARAM_GEN 一致的预览-确认流程。
 */
export async function enqueueSimilarProblem(sourceProblemId: string, operatorId: string) {
  const sourceProblem = await prisma.problem.findUnique({
    where: { id: sourceProblemId },
    select: {
      id: true,
      title: true,
      description: true,
      input: true,
      output: true,
      tags: true,
      difficulty: true,
      stdCode: true,
      stdLang: true,
    },
  })
  if (!sourceProblem) {
    throw new ApiError('NOT_FOUND', '原题不存在', 404)
  }

  return enqueueAiGeneration(operatorId, {
    mode: 'similar',
    sourceProblemId,
    sourceProblem: {
      title: sourceProblem.title,
      description: sourceProblem.description,
      input: sourceProblem.input || undefined,
      output: sourceProblem.output || undefined,
      tags: sourceProblem.tags,
      difficulty: sourceProblem.difficulty,
      stdCode: sourceProblem.stdCode,
      stdLang: sourceProblem.stdLang,
    },
  } as AiGenerateBody)
}

/**
 * Task 29.1: 批量出题入队
 *
 * 为每个主题独立 enqueueAiGeneration，关联 params.batchId = uuid()。
 * 校验 topics.length <= 5。
 */
export async function enqueueBatchGeneration(
  topics: string[],
  options: {
    difficulty?: string
    type?: string
    modelId?: string
    additionalInfo?: string
  },
  operatorId: string
): Promise<{ batchId: string; logIds: string[] }> {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new ApiError('MISSING_FIELDS', 'topics 不能为空', 400)
  }
  if (topics.length > 5) {
    throw new ApiError('TOO_MANY_TOPICS', '批量出题最多 5 个主题', 400)
  }

  const batchId = crypto.randomUUID()
  const logIds: string[] = []

  for (const topic of topics) {
    const { logId } = await enqueueAiGeneration(operatorId, {
      mode: 'parametric',
      type: options.type || 'programming',
      difficulty: options.difficulty || '入门',
      topic: [topic],
      additionalInfo: options.additionalInfo,
      modelId: options.modelId,
      batchId,
    } as AiGenerateBody)
    logIds.push(logId)
  }

  logger.info('[ai/service] 批量出题已入队', { batchId, count: logIds.length })
  return { batchId, logIds }
}

/**
 * Task 30.3: 手动入队失败诊断任务
 *
 * 注：queue.ts 的 autoEnqueueDiagnose 已在任务 FAILED 时自动入队诊断，
 * 本方法供管理员手动触发诊断使用。
 */
export async function enqueueDiagnose(parentLogId: string, operatorId: string) {
  const parentLog = await prisma.aiGenerationLog.findUnique({
    where: { id: parentLogId },
    select: { id: true, error: true, params: true, result: true, userId: true },
  })
  if (!parentLog) {
    throw new ApiError('NOT_FOUND', '父任务不存在', 404)
  }

  const parentParams = (parentLog.params as Record<string, unknown>) || {}
  const parentResult = (parentLog.result as Record<string, unknown>) || {}

  const diagnoseLog = await prisma.aiGenerationLog.create({
    data: {
      userId: operatorId,
      status: 'PENDING',
      parentLogId,
      params: {
        mode: 'diagnose',
        parentLogId,
        originalMode: parentParams.mode || 'unknown',
        error: parentLog.error || '手动触发诊断',
        modelId: parentParams.modelId || null,
        promptHash: parentParams.promptHash || null,
        parseError: parentResult.parseInfo || null,
        qualityIssues: parentResult.qualityIssues || null,
      } as Prisma.InputJsonValue,
    },
  })

  await addAiJob({
    logId: diagnoseLog.id,
    userId: operatorId,
    params: {
      mode: 'diagnose' as any,
      modelId: parentParams.modelId as string | undefined,
      _parentLogId: parentLogId,
      _originalMode: (parentParams.mode as string) || 'unknown',
      _error: parentLog.error || '手动触发诊断',
      _promptHash: parentParams.promptHash as string | undefined,
    } as any,
  })

  return { logId: diagnoseLog.id }
}
