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
  background?: string | null
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
  /** 标程代码（用于"有标程/无标程"筛选维度），后端 listAllProblemsForAdmin 已返回 */
  stdCode?: string | null
  /** 标程语言（cpp/c/python），与 stdCode 配套 */
  stdLang?: string | null
  /** 各关联实体的数量统计（Prisma _count） */
  _count?: {
    testCases?: number
  }
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

/** 批量动作类型 */
export type BatchActionType = 'publish' | 'unpublish' | 'delete' | 'contest'
