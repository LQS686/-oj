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
  /** 标程代码（仅题目详情接口返回；列表接口为减小传输只返回 stdLang） */
  stdCode?: string | null
  /** 标程语言（cpp/c/python），列表接口用非空判断"有标程" */
  stdLang?: string | null
  /** 各关联实体的数量统计（后端 groupBy 一次聚合，Mongo 下避免 _count N+1） */
  _count?: {
    testCases?: number
  }
}

/** 题目列表响应中的筛选后统计（后端 listAllProblemsForAdmin 返回 stats 字段） */
export interface ProblemListStats {
  /** 全部题目总数（未筛选） */
  totalAll: number
  /** 当前筛选条件下的题目总数 */
  total: number
  /** 公开题目数（筛选后） */
  public: number
  /** 隐藏（private）题目数（筛选后） */
  hidden: number
  /** 竞赛题目数（筛选后） */
  contest: number
  /** 有标程题目数（筛选后） */
  hasStd: number
  /** 有测试点题目数（筛选后） */
  hasTests: number
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
