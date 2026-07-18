import { handleAnalyze } from './analyze'
import { handleSuggestMetadata } from './suggest-metadata'
import { handleDiagnose } from './diagnose'
import { handleTestData, handleTestDataIncremental, handleTestDataManualFallback } from './test-data'
import { handleParametricOrSimilar } from './parametric'
import type { JobExecutionContext } from './types'

/**
 * 按 job.data.params.mode 分发到对应的 handler。
 *
 * 分发规则（与原 _executeJobInner 的 if 链一致）：
 *   - analyze              → handleAnalyze
 *   - suggest_metadata     → handleSuggestMetadata
 *   - diagnose             → handleDiagnose
 *   - test_data            → handleTestData（内部含 runSolutionValidation + targetProblemId 分支 / manual fallback）
 *   - test_data_incremental → handleTestDataIncremental（内部含 targetProblemId 分支 / manual fallback）
 *   - parametric / similar → handleParametricOrSimilar
 *   - default（未匹配）    → handleTestDataManualFallback
 */
export async function dispatchByMode(ctx: JobExecutionContext): Promise<void> {
  const mode = ctx.job.data.params.mode
  switch (mode) {
    case 'analyze':
      return handleAnalyze(ctx)
    case 'suggest_metadata':
      return handleSuggestMetadata(ctx)
    case 'diagnose':
      return handleDiagnose(ctx)
    case 'test_data':
      return handleTestData(ctx)
    case 'test_data_incremental':
      return handleTestDataIncremental(ctx)
    case 'parametric':
    case 'similar':
      return handleParametricOrSimilar(ctx)
    default:
      return handleTestDataManualFallback(ctx)
  }
}
