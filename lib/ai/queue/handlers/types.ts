import type { QueuedJob } from '../types'
import type { GeneratedProblem } from '../../prompts/core/types'

export type Mode =
  | 'analyze'
  | 'suggest_metadata'
  | 'diagnose'
  | 'test_data'
  | 'test_data_incremental'
  | 'parametric'
  | 'similar'

/**
 * Mode handler 共享上下文
 *
 * `_executeJobInner` 在调用 `dispatchByMode(ctx)` 前完成：
 *   1. 更新 DB 状态为 PROCESSING
 *   2. 计算并持久化 promptHash（仅生成类 mode）
 *   3. 调用 `generateProblems`（仅 analyze/suggest_metadata/diagnose 之外的 mode）
 *
 * handler 通过 `ctx.job` 访问原始 job 数据；通过 `ctx.testCases` / `ctx.problems` 等
 * 访问 generateProblems 结果。handler 可以修改 `ctx.testCases`（如标程验证后替换 output）。
 * handler 内部需设置 `ctx.job.status = 'completed'`。
 */
export interface JobExecutionContext {
  job: QueuedJob
  problems: GeneratedProblem[]
  /**
   * generateProblems 的返回值。
   *
   * 注意：仅 test_data mode 下 generateProblems 会返回非空 testCases；
   * test_data_incremental / parametric / similar mode 下 generateProblems
   * 不返回 testCases 字段，因此此处为 undefined。
   *
   * 下游 handler 必须用真值检查（`ctx.testCases && ...`）判定是否可用，
   * 与原始 `_executeJobInner` 中的 `&& testCases` 守卫语义一致。
   */
  testCases: any[] | undefined
  thought: string | undefined
  tokensUsed: number
  qualityIssues: any
  stats: {
    total: number
    passed: number
    failed: number
    avgTime: number
    avgMemory: number
  }
}

export type JobHandlerResult = void
