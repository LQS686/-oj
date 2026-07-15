/**
 * lib/problem/ai-status.ts
 * 题目 AI 生成来源状态统一管理（L-1 修复：所有 aiStatus 写操作汇聚到此）
 *
 * 状态枚举与 prisma/schema.prisma 中 aiStatus 字段定义保持一致：
 *   - MANUAL_CREATED: 人工创建
 *   - AI_ASSISTED:    AI 辅助生成（人工审核过）
 *   - AI_GENERATED:   AI 自动生成（未经人工审核）
 *
 * 何时使用：
 *   - AI 工厂首次生成题目草稿 → AI_GENERATED
 *   - 管理员审核通过并发布 → AI_ASSISTED
 *   - 人工编辑或重写 → MANUAL_CREATED
 */
import { prisma } from '@/lib/prisma'

export const ProblemAiStatus = {
  MANUAL_CREATED: 'MANUAL_CREATED',
  AI_ASSISTED: 'AI_ASSISTED',
  AI_GENERATED: 'AI_GENERATED',
} as const

export type ProblemAiStatusValue =
  (typeof ProblemAiStatus)[keyof typeof ProblemAiStatus]

const ALL: ReadonlySet<string> = new Set(Object.values(ProblemAiStatus))

export function isProblemAiStatus(value: unknown): value is ProblemAiStatusValue {
  return typeof value === 'string' && ALL.has(value)
}

export function assertProblemAiStatus(value: unknown): ProblemAiStatusValue {
  if (!isProblemAiStatus(value)) {
    throw new Error(
      `非法的 ProblemAiStatus: ${String(value)}。请使用 lib/problem/ai-status.ts 中的枚举。`
    )
  }
  return value
}

/**
 * 统一写入口：仅本函数可写 aiStatus。
 * - 同时联动更新 isAiGenerated 字段（保持向后兼容字段）
 * - 自动清除题目缓存
 * - 触发 status 字段（若传入）写入
 */
export interface SetProblemAiStatusInput {
  problemId: string
  aiStatus: ProblemAiStatusValue
  /** 同时更新 aiPrompt（可选） */
  aiPrompt?: string | null
  /** 是否同时清除题目缓存（默认 true） */
  clearCache?: boolean
}

export async function setProblemAiStatus(input: SetProblemAiStatusInput) {
  const { problemId, aiStatus, aiPrompt, clearCache = true } = input
  assertProblemAiStatus(aiStatus)

  const isAiGenerated = aiStatus !== ProblemAiStatus.MANUAL_CREATED

  const data: Record<string, unknown> = {
    aiStatus,
    isAiGenerated,
  }
  if (aiPrompt !== undefined) {
    data.aiPrompt = aiPrompt
  }

  const updated = await prisma.problem.update({
    where: { id: problemId },
    data,
    select: { id: true, aiStatus: true, isAiGenerated: true, aiPrompt: true },
  })

  if (clearCache) {
    try {
      const { cache } = await import('@/lib/cache')
      cache.deleteByPrefix('problem:byId')
      cache.deleteByPrefix('problem:list')
    } catch {
      // 缓存清理失败不影响主流程
    }
  }

  return updated
}