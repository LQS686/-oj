/**
 * AI 工作区相关前端类型定义
 *
 * 注意：后端的 AiGenerationLog 通过 prisma 暴露的类型在 lib/ai/service.ts 中使用；
 * 这里只定义前端组件需要的展示类型，与后端 API 响应保持兼容（字段从 log.params 中提取）。
 */

/**
 * AI 任务状态枚举（与后端 AiGenerationLog.status 保持一致）
 * Phase 6: 新增 'DISCARDED'（预览丢弃）
 */
export type AiTaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DISCARDED'

/**
 * AI 生成任务模式（与 lib/ai/prompts/core/types.ts GenerationMode + 队列 mode 对齐）
 * - parametric: 参数化出题
 * - test_data: 测试数据生成
 * - analyze: 题目智能分析（Phase 2 新能力）
 * - suggest_metadata: 元数据建议（Phase 2 新能力）
 * - similar: 相似题生成（Phase 6）
 * - diagnose: 失败自动诊断（Phase 6）
 * - test_data_incremental: 测试数据增量补充（Phase 6）
 */
export type AiTaskMode = 'parametric' | 'test_data' | 'analyze' | 'suggest_metadata' | 'similar' | 'diagnose' | 'test_data_incremental'

/**
 * AI 任务参数（从后端 AiGenerationLog.params JSON 字段提取）
 *
 * 字段均为可选，不同 mode 下字段不同：
 * - parametric: topic / title / difficulty
 * - test_data: targetProblemId / title
 * - analyze: problemId
 * - suggest_metadata: input
 */
export interface AiTaskParams {
  /** 关联题目 ID（test_data / analyze / suggest_metadata 等 mode 下使用） */
  problemId?: string
  /** 别名：旧字段 targetProblemId（test_data 模式） */
  targetProblemId?: string
  /** 出题主题数组（parametric 模式） */
  topic?: string[]
  /** 题目标题（test_data / parametric 模式） */
  title?: string
  /** 难度（parametric 模式） */
  difficulty?: string
  /** 模型 ID（所有 mode 通用） */
  modelId?: string
  /** 关联批次 ID（批量出题用，Phase 6） */
  batchId?: string
  /** 父任务 ID（任务链用，Phase 6） */
  parentLogId?: string
  /** Prompt 版本哈希（Phase 6） */
  promptHash?: string
  [k: string]: unknown
}

/**
 * AI 任务（前端展示用，从后端 AiGenerationLog 映射而来）
 */
export interface AiTask {
  id: string
  status: AiTaskStatus
  mode?: AiTaskMode
  createdAt: string
  updatedAt?: string
  tokensUsed?: number
  error?: string | null
  params?: AiTaskParams
  result?: unknown
  /** Phase 6: 预估成本 */
  estimatedCost?: number | null
  /** Phase 6: 父任务 ID（任务链） */
  parentLogId?: string | null
}

/**
 * AI 出题结果（generate 模式）
 * 字段对齐后端 lib/ai/prompts/core/types.ts GeneratedProblem（snake_case）
 */
export interface AiGenerationResultProblem {
  title?: string
  description?: string
  difficulty?: string
  tags?: string[]
  input?: string
  output?: string
  samples?: Array<{ input: string; output: string; explanation?: string }>
  hint?: string
  test_cases?: Array<{ input: string; output: string }>
  /** 时间限制（毫秒） */
  time_limit?: number
  /** 内存限制（MB） */
  memory_limit?: number
  /** C++17 标程 */
  solution_cpp?: string
  /** Python3 标程（基于 C++ 标程功能等价翻译） */
  solution_python?: string
  /** 5 段式 markdown 题解（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明） */
  solution_article?: string
}

/**
 * AI 生成结果（覆盖所有 mode）
 */
export interface AiGenerationResult {
  /** generate 模式：题目数组 */
  problems?: AiGenerationResultProblem[]
  /** test_data 模式：测试用例数组 */
  testCases?: Array<{ input: string; output: string }>
  /** 思考过程（所有模式均可能有） */
  thought?: string
  /** 质量自检问题（generate 模式） */
  qualityIssues?: Array<{ problemIndex: number; reason: string; details?: string[] }>
  /** analyze 模式：分析结果 */
  analysis?: {
    suggestedTags?: string[]
    suggestedDifficulty?: string
    qualityIssues?: string[]
    suggestedHints?: string[]
    testCaseGaps?: string[]
  }
  /** suggest_metadata 模式：元数据建议 */
  metadata?: {
    tags?: string[]
    difficulty?: string
    hint?: string
    timeLimit?: number
    memoryLimit?: number
  }
  /** 诊断结果（Phase 6） */
  diagnosis?: {
    failureType?: string
    suggestedFix?: string
    analysis?: string
    similarFailureCount?: number
    parentLogId?: string
  }
  /** Phase 6 Task 27: 预览题目数组（parametric/similar 模式，待 commit/discard） */
  previewProblems?: AiGenerationResultProblem[]
  /** Phase 6 Task 27: 是否为预览状态 */
  isPreview?: boolean
  /** Phase 6 Task 31: 题解质量评分（综合分 0-5） */
  qualityScore?: number
  /** Phase 6 Task 31: 题解质量评分明细（5 维度） */
  qualityScores?: Record<string, number>
  /** Phase 6 Task 34: 测试数据强度评分（0-100） */
  strengthScore?: number
  /** Phase 6 Task 35: 预估成本 */
  estimatedCost?: number
  /** Phase 6: 标记是否含 Python 标程 */
  hasPythonSolution?: boolean
}

/**
 * AI 能力清单项（与 lib/ai/service.ts AiCapability 对齐）
 */
export interface AiCapability {
  id: string
  label: string
  available: boolean
  href?: string
}
