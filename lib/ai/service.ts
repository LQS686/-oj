/**
 * lib/ai/service.ts
 * AI 出题 / 题解 / 模型发现 — 业务层封装
 */
import { prisma } from '@/lib/prisma'
import { addAiJob } from './queue'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'

// 业务决策（2026-06）：单次 AI 调用只生成 1 道题，count 字段已废弃
export const AI_GENERATION_COUNT = 1

export interface AiGenerateBody {
  mode?: string
  // Parametric
  type?: string
  difficulty?: string
  topic?: string | string[]
  additionalInfo?: string
  // Test Data Gen
  title?: string
  description?: string
  inputDescription?: string
  outputDescription?: string
  // Common
  targetProblemId?: string
  solutionCode?: string
  solutionLanguage?: string
  modelId?: string
  // Retry
  retryFromLogId?: string
  reduceTemperature?: boolean
  [k: string]: any
}

/**
 * 列出当前用户最近 N 条 AI 生成日志
 */
export async function listRecentAiLogs(userId: string, take = 20) {
  return prisma.aiGenerationLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

/**
 * 获取单条 AI 生成日志
 */
export async function getAiLogById(logId: string) {
  const log = await prisma.aiGenerationLog.findUnique({ where: { id: logId } })
  if (!log) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  return log
}

const STUCK_TIMEOUT_MS = 10 * 60 * 1000

function isStuckLog(log: { status: string; createdAt: Date }) {
  return (
    (log.status === 'PENDING' || log.status === 'PROCESSING') &&
    Date.now() - new Date(log.createdAt).getTime() > STUCK_TIMEOUT_MS
  )
}

/**
 * 把 modelId 对应偏好统计 +1（不影响主流程，失败时仅日志）
 */
export async function touchAiModelPreference(userId: string, modelId: string) {
  try {
    await prisma.userAiPreference.upsert({
      where: { userId_modelId: { userId, modelId } },
      update: { lastUsed: new Date(), count: { increment: 1 } },
      create: {
        userId,
        modelId,
        count: 1,
        lastUsed: new Date(),
        isDefault: false,
      },
    })
  } catch (e) {
    console.error('Failed to update preference', e)
  }
}

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

  const retryParams = (oldLog.params as any) || {}
  logger.info('[ai-generate] Retry from log', { retryFromLogId, userId, reduceTemperature })

  const retryLog = await prisma.aiGenerationLog.create({
    data: {
      userId,
      status: 'PENDING',
      params: {
        ...retryParams,
        _retryFrom: retryFromLogId,
        _reduceTemperature: reduceTemperature || true,
      },
    },
  })

  await addAiJob({
    logId: retryLog.id,
    userId,
    params: {
      mode: retryParams.mode || 'parametric',
      type: retryParams.type,
      difficulty: retryParams.difficulty,
      topic: retryParams.topic,
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
      _retry: true,
      _reduceTemperature: true,
    },
  })

  return { logId: retryLog.id, retriedFrom: retryFromLogId }
}

/**
 * 校验入参的必填字段（按 mode 分支）
 */
export function validateAiGenerateBody(body: AiGenerateBody) {
  if (body.mode === 'test_data') {
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
      params: body as any,
    },
  })

  await addAiJob({
    logId: log.id,
    userId,
    params: {
      mode: (body.mode as any) || 'parametric',
      // Parametric
      type: body.type,
      difficulty: body.difficulty,
      topic: body.topic as any,
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
    },
  })

  return { logId: log.id }
}
