import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import type { AiCapability } from './types'

/* ============================================================================
 * AI 能力清单
 * ========================================================================== */

/**
 * 返回角色相关的 AI 能力清单
 * - generate / analyze / suggest_metadata / test_data 始终返回
 *   （每个 Tab 的历史记录由右侧侧栏展示，按 mode 过滤，无需独立 Tab）
 */
export function getAiCapabilities(userRole: string): AiCapability[] {
  void userRole
  return [
    { id: 'generate', label: '智能出题', available: true },
    { id: 'analyze', label: '题目分析', available: true },
    { id: 'suggest_metadata', label: '元数据建议', available: true },
    { id: 'test_data', label: '测试数据生成', available: true },
  ]
}

/**
 * Task 37.1: 获取模型推荐列表
 *
 * 基于最近 30 天 AiGenerationLog 聚合计算 successRate + avgDuration，
 * 推荐条件（全部满足才标 isRecommended=true）：
 *   1. 最近 30 天总样本数 >= 3（避免少量样本误判）
 *   2. successRate > 90%（成功率严格大于 90%）
 *   3. avgDuration < 30s（COMPLETED 任务的平均执行耗时小于 30 秒）
 *   4. 最近 7 天至少有 1 次成功任务（保证模型当前可用）
 *
 * 返回前 3 个推荐模型（按 successRate 降序 + avgDuration 升序排序）。
 *
 * @param userId 可选：未使用（基于全局统计），保留参数以备未来个性化扩展
 */
export async function getModelRecommendations(userId?: string) {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const where: Prisma.AiGenerationLogWhereInput = {
    createdAt: { gte: since30d },
    status: { in: ['COMPLETED', 'FAILED'] },
  }
  // 不按 userId 过滤：推荐基于全局统计数据（所有用户的成功率）
  // userId 参数保留供未来个性化扩展使用
  void userId

  const logs = await prisma.aiGenerationLog.findMany({
    where,
    select: { params: true, status: true, createdAt: true, updatedAt: true },
    take: 1000, // 限制扫描量
    orderBy: { createdAt: 'desc' },
  })

  // 按 modelId 聚合
  const stats = new Map<string, {
    total: number
    success: number
    durations: number[]
    hasRecentSuccess: boolean
  }>()
  for (const log of logs) {
    const params = (log.params as Record<string, unknown>) || {}
    const modelId = params.modelId as string | undefined
    if (!modelId) continue

    const entry = stats.get(modelId) || { total: 0, success: 0, durations: [], hasRecentSuccess: false }
    entry.total++
    if (log.status === 'COMPLETED') {
      entry.success++
      // 计算 COMPLETED 任务的耗时（秒）
      const durationMs = new Date(log.updatedAt).getTime() - new Date(log.createdAt).getTime()
      if (Number.isFinite(durationMs) && durationMs > 0) {
        entry.durations.push(durationMs / 1000)
      }
      // 标记 7 天内有成功任务
      if (new Date(log.createdAt) >= since7d) {
        entry.hasRecentSuccess = true
      }
    }
    stats.set(modelId, entry)
  }

  // 计算推荐分：满足所有条件才推荐
  const recommendations: Array<{
    modelId: string
    successRate: number
    avgDuration: number
    total: number
    isRecommended: boolean
  }> = []
  for (const [modelId, entry] of stats.entries()) {
    if (entry.total < 3) continue // 样本不足，不推荐
    const successRate = entry.success / entry.total
    const avgDuration = entry.durations.length > 0
      ? entry.durations.reduce((a, b) => a + b, 0) / entry.durations.length
      : Infinity // 无成功任务 → 平均耗时视为无穷大
    // Task 37.1 推荐条件：successRate > 90% + avgDuration < 30s + 最近 7 天有成功
    const isRecommended =
      successRate > 0.9 &&
      avgDuration < 30 &&
      entry.hasRecentSuccess
    recommendations.push({
      modelId,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration * 100) / 100,
      total: entry.total,
      isRecommended,
    })
  }

  // 推荐模型按成功率降序 + 平均耗时升序排在前；非推荐模型保持成功率降序
  recommendations.sort((a, b) => {
    // 推荐置顶
    if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1
    // 同档位按成功率降序
    if (b.successRate !== a.successRate) return b.successRate - a.successRate
    // 再按平均耗时升序
    return a.avgDuration - b.avgDuration
  })
  return recommendations.slice(0, 3)
}

/**
 * Task 38.5: 重置模型健康状态
 */
export async function resetModelHealth(modelId: string): Promise<{ reset: true }> {
  const model = await prisma.aiModel.findUnique({ where: { id: modelId } })
  if (!model) {
    throw new ApiError('NOT_FOUND', 'Model not found', 404)
  }
  await prisma.aiModel.update({
    where: { id: modelId },
    data: {
      healthStatus: null,
      lastHealthCheckAt: new Date(),
    },
  })
  logger.info('[ai/service] 模型健康度已重置', { modelId })
  return { reset: true }
}
