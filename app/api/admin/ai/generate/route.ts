/**
 * /api/admin/ai/generate - AI 题目生成（管理员）
 *
 * GET  查日志列表 / 单条日志状态
 * POST 入队生成任务
 */
import { withApi, ok, readJson, throw400, throw403, throw404, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { addAiJob } from '@/lib/ai/queue'
import { logger } from '@/lib/logger'

interface GenerateBody {
  mode?: string
  // Parametric
  type?: string
  difficulty?: string
  topic?: string
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
}

/**
 * GET /api/admin/ai/generate
 *   无 logId -> 返回当前用户最近 20 条
 *   有 logId -> 返回单条
 */
export const GET = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const { searchParams } = new URL(req.url)
  const logId = searchParams.get('logId')

  if (!logId) {
    // Return list of recent logs
    const logs = await prisma.aiGenerationLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return ok({ data: logs })
  }

  const log = await prisma.aiGenerationLog.findUnique({
    where: { id: logId },
  })

  if (!log) throw404('Log not found')

  return ok({ data: log })
})

/**
 * POST /api/admin/ai/generate
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<GenerateBody>(req)
  const {
    mode = 'parametric',
    // Parametric
    type, difficulty, topic, additionalInfo,
    // Test Data Gen
    title, description, inputDescription, outputDescription,
    // Common
    targetProblemId,
    solutionCode,
    solutionLanguage,
    modelId,
    // Retry
    retryFromLogId,
    reduceTemperature,  // 显式降温度（用于重试）
  } = body
  // 业务决策（2026-06）：单次 AI 调用只生成 1 道题，count 字段已废弃
  const COUNT = 1

  // 3. Retry path: 从已失败日志重跑
  if (retryFromLogId) {
    const oldLog = await prisma.aiGenerationLog.findUnique({ where: { id: retryFromLogId } })
    if (!oldLog) throw404('Log not found')
    if (oldLog!.userId !== user.id) {
      throw403('Forbidden')
    }
    if (oldLog!.status === 'COMPLETED') {
      throw400('ALREADY_COMPLETED', '该日志已成功完成，无需重试')
    }
    // 僵尸日志（dev server 重启后遗留的 PROCESSING 永远完不成）允许重试
    // 判定标准：PENDING/PROCESSING 且 createdAt 超过 10 分钟
    const STUCK_TIMEOUT_MS = 10 * 60 * 1000
    const isStuck = (oldLog!.status === 'PENDING' || oldLog!.status === 'PROCESSING') &&
      (Date.now() - new Date(oldLog!.createdAt).getTime()) > STUCK_TIMEOUT_MS
    if (!isStuck && (oldLog!.status === 'PENDING' || oldLog!.status === 'PROCESSING')) {
      throw400('IN_PROGRESS', '该日志正在处理中，请等待完成后再试')
    }

    // 重用原参数
    const retryParams = (oldLog!.params as any) || {}
    logger.info('[ai-generate] Retry from log', {
      retryFromLogId,
      userId: user.id,
      reduceTemperature,
    })

    // 重置日志状态为 PENDING
    const retryLog = await prisma.aiGenerationLog.create({
      data: {
        userId: user.id,
        status: 'PENDING',
        params: {
          ...retryParams,
          // 重试时强制重置：清空旧 result/error，标记这是重试
          _retryFrom: retryFromLogId,
          _reduceTemperature: reduceTemperature || true,
        },
      },
    })

    // 加入队列（沿用原参数）
    await addAiJob({
      logId: retryLog.id,
      userId: user.id,
      params: {
        mode: retryParams.mode || mode,
        type: retryParams.type,
        difficulty: retryParams.difficulty,
        topic: retryParams.topic,
        count: COUNT,  // 业务决策（2026-06）：硬编码 1
        additionalInfo: retryParams.additionalInfo,
        title: retryParams.title,
        description: retryParams.description,
        inputDescription: retryParams.inputDescription,
        outputDescription: retryParams.outputDescription,
        targetProblemId: retryParams.targetProblemId,
        solutionCode: retryParams.solutionCode,
        solutionLanguage: retryParams.solutionLanguage,
        modelId: retryParams.modelId || modelId,
        // 重试标识，让 generator 内部降温度
        _retry: true,
        _reduceTemperature: true,  // 重试默认降温度
      },
    })

    return ok({ data: { logId: retryLog.id, retriedFrom: retryFromLogId } })
  }

  // Validation based on mode
  if (mode === 'test_data') {
    if (!title || !description) {
      throw400('MISSING_FIELDS', 'Missing title or description')
    }
    // 标程可选：拆分流程中 AI 在第一阶段已生成 solution_cpp，但部分模型可能未遵守；后端不应阻塞
    // test_data 生成器内部 hasSolution=false 走"无标程：output 必须是真实结果"路径
  } else {
    // Parametric mode (default)
    // 业务决策（2026-06）：count 字段已废弃，固定为 1
    if (!type || !difficulty || !topic) {
      throw400('MISSING_FIELDS', 'Missing required fields')
    }
  }

  // 3. Update User Preference
  if (modelId) {
    try {
      await prisma.userAiPreference.upsert({
        where: {
          userId_modelId: {
            userId: user.id,
            modelId: modelId,
          },
        },
        update: {
          lastUsed: new Date(),
          count: { increment: 1 },
        },
        create: {
          userId: user.id,
          modelId: modelId,
          count: 1,
          lastUsed: new Date(),
          isDefault: false,
        },
      })
    } catch (e) {
      console.error('Failed to update preference', e)
    }
  }

  // 4. Create Log
  const log = await prisma.aiGenerationLog.create({
    data: {
      userId: user.id,
      status: 'PENDING',
      params: body as any, // Store full body
    },
  })

  // 4. Add to queue
  await addAiJob({
    logId: log.id,
    userId: user.id,
    params: {
      mode: (mode as any) || 'parametric',
      // Parametric
      type,
      difficulty,
      topic: topic as any,  // 业务参数为单字符串，队列可能要求数组（保持兼容）
      count: COUNT,  // 业务决策（2026-06）：硬编码 1
      additionalInfo,
      // Test Data Gen
      title,
      description,
      inputDescription,
      outputDescription,
      // Common
      targetProblemId,
      solutionCode,
      solutionLanguage,
      modelId,
    },
  })

  return ok({ data: { logId: log.id } })
})
