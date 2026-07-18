import { prisma } from '@/lib/prisma'
import { diagnoseFailure } from '../../analyzers/failure-diagnoser'
import { calculateAndStoreCost } from '../utils'
import type { JobExecutionContext } from './types'

/**
 * Mode: DIAGNOSE — 失败自动诊断（Task 30.5，只读分析，不写 Problem/Solution）
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 diagnose 分支（535-601 行）。
 */
export async function handleDiagnose(ctx: JobExecutionContext): Promise<void> {
  const job = ctx.job
  // 读取诊断上下文（由 autoEnqueueDiagnose 写入 log.params）
  const log = await prisma.aiGenerationLog.findUnique({
    where: { id: job.id },
    select: { params: true, parentLogId: true },
  })
  const diagParams = (log?.params as Record<string, any>) || {}
  const parentLogId = log?.parentLogId || diagParams.parentLogId

  // 查询近 7 天同 promptHash 的失败任务数（Task 39.4）
  let similarFailureCount: number | undefined
  if (diagParams.promptHash) {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      similarFailureCount = await prisma.aiGenerationLog.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: since },
          params: { path: ['promptHash'], equals: diagParams.promptHash } as any,
        },
      })
    } catch (e) {
      // JsonFilter path 查询可能不被支持，降级为 0
      similarFailureCount = 0
    }
  }

  const diagnosis = await diagnoseFailure(
    {
      error: diagParams.error || (job.data.params as any)._error || '未知错误',
      originalMode: diagParams.originalMode || (job.data.params as any)._originalMode || 'unknown',
      parseError: diagParams.parseError,
      qualityIssues: Array.isArray(diagParams.qualityIssues) ? diagParams.qualityIssues : undefined,
      promptHash: diagParams.promptHash || (job.data.params as any)._promptHash,
    },
    {
      userId: job.data.userId,
      modelId: job.data.params.modelId,
      similarFailureCount,
    }
  )

  if (job.aborted) return

  await prisma.aiGenerationLog.update({
    where: { id: job.id },
    data: {
      status: 'COMPLETED',
      result: {
        diagnosis: {
          failureType: diagnosis.failureType,
          suggestedFix: diagnosis.suggestedFix,
          analysis: diagnosis.analysis,
          similarFailureCount: diagnosis.similarFailureCount,
          parentLogId,
        },
      } as any,
      tokensUsed: diagnosis.tokensUsed || 0,
    },
  })

  // Phase 6 Task 35.1: 计算成本
  calculateAndStoreCost(job.id, diagnosis.tokensUsed || 0, job.data.params.modelId).catch(() => {})

  job.status = 'completed'
}
