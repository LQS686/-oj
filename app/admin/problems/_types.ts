/**
 * 题目管理页面的类型定义。
 *
 * Problem 对齐 /api/admin/problems 返回结构；
 * LogEntry 对齐 /api/admin/logs/source-changes 返回结构。
 */

export interface Problem {
  id: string
  problemNumber: string | null
  title: string
  description?: string
  input?: string
  output?: string
  samples?: { input: string; output: string }[]
  hint?: string
  source?: string
  difficulty: string
  tags: string[]
  isPublic: boolean
  visibility: string
  timeLimit?: number
  memoryLimit?: number
  totalSubmit: number
  totalAccepted: number
  createdAt: string
  isAiGenerated?: boolean
  aiStatus: string
}

export interface LogEntry {
  id: string
  userId: string | null
  action: string
  resource?: string
  details?: {
    count?: number
    targetSource?: string
    [key: string]: unknown
  } | null
  ip?: string | null
  userAgent?: string | null
  createdAt: string
}

export type ActiveTab = 'list' | 'logs'

/** 题目来源标记（批量修改来源弹窗使用） */
export type ProblemSource = 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED'

/** 批量动作类型 */
export type BatchActionType = 'publish' | 'unpublish' | 'delete' | 'contest'
