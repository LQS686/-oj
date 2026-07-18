import type { Prisma } from '@prisma/client'

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
 * 列出当前用户的 AI 生成日志（支持 take / status / mode 过滤）
 *
 * - take: 限制返回条数（不传则返回全部匹配记录）
 * - status: 任务状态过滤（PENDING / PROCESSING / COMPLETED / FAILED / DISCARDED）
 * - mode: 任务模式过滤（parametric / test_data / analyze / suggest_metadata / similar / diagnose 等）
 *         mode 存储在 params.mode JSON 字段中，由 service 层做内存过滤
 */
export interface ListUserAiTasksOptions {
  take?: number
  status?: string
  mode?: string
}

/**
 * AI 日志 + 关联用户名（跨用户查询用）
 */
export type AiLogWithUser = Prisma.AiGenerationLogGetPayload<{
  include: { user: { select: { username: true } } }
}>

export interface AiCapability {
  id: string
  label: string
  available: boolean
  href?: string
}

/**
 * 元数据建议输入（与 lib/ai/analyzers/metadata-suggester 的输入类型对齐）
 */
export interface MetadataSuggestionInput {
  description: string
  samples?: any[]
  input?: string
  output?: string
}

export interface TestConnectionInput {
  provider: string
  model?: string
  apiKey?: string
  baseUrl?: string
}
