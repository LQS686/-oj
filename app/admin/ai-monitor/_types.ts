export interface QueueStatus {
  waiting: number
  active: number
  maxConcurrent: number
}

export interface QueueStatusResponse {
  problemQueue: QueueStatus
  solutionQueue: QueueStatus
}

export interface AiLogItem {
  id: string
  userId: string
  status: string
  params: {
    modelId?: string
    problemId?: string
    targetProblemId?: string
    mode?: string
    /** Phase 6 Task 36: 父任务 ID（任务链） */
    parentLogId?: string
    /** Phase 6 Task 39: prompt 版本哈希 */
    promptHash?: string
    /** Phase 6 Task 29: 批次 ID */
    batchId?: string
  } | null
  result: unknown
  error: string | null
  tokensUsed: number
  /** Phase 6 Task 35: 预估成本 */
  estimatedCost?: number | null
  createdAt: string
  updatedAt: string
  user: { username: string }
}

export interface LogsResponse {
  items: AiLogItem[]
  totalCount: number
}

/** Phase 6 Task 35.3: AI 成本聚合（来自 /api/admin/dashboard） */
export interface AiCostData {
  todayCost: number
  monthCost: number
  todayTaskCount: number
  monthTaskCount: number
}

/** 任务列表展示模式：平铺列表 / 任务链图 */
export type ViewMode = 'list' | 'chain'
