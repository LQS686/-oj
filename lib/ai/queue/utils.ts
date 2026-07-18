import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * Phase 6 Task 35.1: 计算并存储 AI 任务预估成本
 *
 * estimatedCost = tokensUsed * model.pricePerMillionTokens / 1_000_000
 * 失败时仅日志，不阻塞主流程。
 */
export async function calculateAndStoreCost(logId: string, tokensUsed: number, modelId?: string) {
  if (!modelId || !tokensUsed || tokensUsed <= 0) return
  try {
    const model = await prisma.aiModel.findUnique({
      where: { id: modelId },
      select: { pricePerMillionTokens: true },
    })
    if (!model?.pricePerMillionTokens) return
    const estimatedCost = (tokensUsed * model.pricePerMillionTokens) / 1_000_000
    await prisma.aiGenerationLog.update({
      where: { id: logId },
      data: { estimatedCost },
    })
  } catch (e) {
    logger.warn('[ai-queue] 计算预估成本失败', { logId, modelId, err: e })
  }
}

/**
 * Phase 6 Task 38.1: 任务失败时更新模型健康状态
 *
 * 统计该模型最近 10 条任务的**连续失败计数**（从最新任务倒序，遇到首个非失败任务停止）：
 * - 连续 3 次失败 → degraded
 * - 连续 5 次失败 → down
 * 仅对 API_ERROR / TIMEOUT 类错误触发（非业务逻辑错误）。
 *
 * 注意：仅当 error 为 AI_API_ERROR / AI_TIMEOUT / 网络类错误时才计为健康度失败
 *      （用户取消 / 业务校验失败不计）。
 */
export async function updateModelHealthOnFailure(modelId: string | undefined, errorMessage: string) {
  if (!modelId) return
  // 仅对 API/超时类错误触发健康度更新
  const isApiError = /AI_API_ERROR|429|5\d{2}|timeout|超时|ECONNRESET|ETIMEDOUT|fetch failed/i.test(errorMessage)
  if (!isApiError) return

  try {
    // 查询最近 10 条同 modelId 任务（按 createdAt 降序），用于计算"连续失败计数"
    // 注意：Prisma JsonFilter path 过滤在 MongoDB 上可能不支持，降级为内存过滤
    const recentLogs = await prisma.aiGenerationLog.findMany({
      where: { status: { in: ['COMPLETED', 'FAILED'] } },
      select: { status: true, params: true, error: true, createdAt: true },
      take: 200, // 多取一些以备 JSON path 不支持时的内存过滤
      orderBy: { createdAt: 'desc' },
    })

    // 内存过滤同 modelId 任务
    const sameModelLogs = recentLogs.filter((log) => {
      const p = (log.params as Record<string, unknown>) || {}
      return p.modelId === modelId
    }).slice(0, 10) // 取最近 10 条

    // 从最新任务倒序统计连续失败次数
    let consecutiveFailures = 0
    for (const log of sameModelLogs) {
      if (log.status === 'FAILED') {
        // 仅 API/超时类失败才算健康度失败（用户取消 / 业务校验失败不计）
        const err = log.error || ''
        const isHealthFailure = /AI_API_ERROR|429|5\d{2}|timeout|超时|ECONNRESET|ETIMEDOUT|fetch failed/i.test(err)
        if (isHealthFailure) {
          consecutiveFailures++
        } else {
          // 非健康度失败（如用户取消）打断连续计数
          break
        }
      } else {
        // 遇到成功任务，停止计数
        break
      }
    }

    let healthStatus: string | null = null
    if (consecutiveFailures >= 5) {
      healthStatus = 'down'
    } else if (consecutiveFailures >= 3) {
      healthStatus = 'degraded'
    }

    if (healthStatus) {
      await prisma.aiModel.update({
        where: { id: modelId },
        data: { healthStatus, lastHealthCheckAt: new Date() },
      })
      logger.warn('[ai-queue] 模型健康度降级', {
        modelId,
        healthStatus,
        consecutiveFailures,
      })
    }
  } catch (e) {
    logger.warn('[ai-queue] 更新模型健康度失败', { modelId, err: e })
  }
}

/**
 * Phase 6 Task 30.4: 任务失败后自动入队诊断任务
 *
 * 除 diagnose / 已取消 / 已丢弃 外，所有 FAILED 任务自动入队诊断。
 * 诊断任务失败不阻塞主流程。
 *
 * 注：本函数调用 aiQueue.add 入队诊断任务，为避免与 ./index 形成循环依赖
 *     （index.ts → utils.ts → index.ts），此处使用 dynamic import 获取 aiQueue。
 */
export async function autoEnqueueDiagnose(
  parentLogId: string,
  userId: string,
  error: string,
  originalMode: string,
  modelId?: string,
  promptHash?: string
) {
  try {
    // 读取原任务的 result（可能含 parseError / qualityIssues）
    const parentLog = await prisma.aiGenerationLog.findUnique({
      where: { id: parentLogId },
      select: { result: true, params: true },
    })
    const parentResult = (parentLog?.result as Record<string, unknown>) || {}
    const parentParams = (parentLog?.params as Record<string, unknown>) || {}

    const diagnoseLog = await prisma.aiGenerationLog.create({
      data: {
        userId,
        status: 'PENDING',
        parentLogId,
        params: {
          mode: 'diagnose',
          parentLogId,
          originalMode,
          error,
          modelId: modelId || null,
          promptHash: promptHash || parentParams.promptHash || null,
          parseError: parentResult.parseInfo || null,
          qualityIssues: parentResult.qualityIssues || null,
        } as any,
      },
    })

    // Lazy import to avoid circular dependency: index.ts → utils.ts → index.ts
    const { aiQueue } = await import('./index')
    await aiQueue.add({
      logId: diagnoseLog.id,
      userId,
      params: {
        mode: 'diagnose' as any,
        modelId,
        _parentLogId: parentLogId,
        _originalMode: originalMode,
        _error: error,
        _promptHash: promptHash || (parentParams.promptHash as string) || undefined,
      } as any,
    })

    logger.info('[ai-queue] 自动入队诊断任务', { parentLogId, diagnoseLogId: diagnoseLog.id, originalMode })
  } catch (e) {
    logger.warn('[ai-queue] 自动入队诊断失败', { parentLogId, err: e })
  }
}
