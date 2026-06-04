/**
 * 测试点分数组件 — 统一保证所有题目总分 = 100
 *
 * 设计原则：
 * 1. 任何"添加测试点"路径都必须经过 `distributeTestCaseScores()`，最终总分 = 100
 * 2. 默认均分：`100 / n` 每个，余数加给前 `100 % n` 个
 * 3. 提供 `normalizeTestCaseScores()` 用于修复已有数据（DB migration / AI 生成后兜底）
 * 4. 暴露 `assertTotalScoreIs100()` 在保存前校验，违规抛错
 *
 * 涉及的所有调用点：
 * - AI 出题（[lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts)）
 * - 文件上传测试点（[app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx)）
 * - 题目创建 API（[app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts)）
 * - 题目编辑 API（[app/api/admin/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/route.ts)）
 * - 前端手动添加（[app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx)）
 *
 * 修复脚本：[scripts/normalize-test-case-scores.ts](file:///e:/桌面/oj/scripts/normalize-test-case-scores.ts)
 */

/** 一道测试点的最小结构（来自任何调用方） */
export interface TestCaseScoreInput {
  /** 可选：若提供则保留，否则按 n 重新计算 */
  score?: number
  [key: string]: any
}

export const TOTAL_SCORE = 100

/**
 * 均分测试点分数：每个 ≈ 100/n，余数加给前 r 个，最终总和 = 100
 *
 * @example
 *   distributeTestCaseScores([{}, {}, {}])       // [{score: 34}, {score: 33}, {score: 33}]
 *   distributeTestCaseScores([{}, {}, {}], 'rebalance') // 同上，并丢弃原 score
 *   distributeTestCaseScores([{}, {}], 'keep')   // [{score: 50}, {score: 50}] 保留原值若合法
 */
export function distributeTestCaseScores<T extends TestCaseScoreInput>(
  cases: T[],
  strategy: 'rebalance' | 'keep' = 'rebalance'
): T[] {
  if (!Array.isArray(cases) || cases.length === 0) return cases
  const n = cases.length
  const base = Math.floor(TOTAL_SCORE / n)
  const remainder = TOTAL_SCORE % n

  return cases.map((tc, idx) => {
    let newScore: number
    if (strategy === 'keep' && typeof tc.score === 'number' && tc.score >= 0) {
      // 保留用户原值（兜底用，最终会 assertTotalScoreIs100 校验）
      newScore = tc.score
    } else {
      // 强制重新均分
      newScore = base + (idx < remainder ? 1 : 0)
    }
    return { ...tc, score: newScore }
  })
}

/**
 * 校验测试点总分是否为 100
 * @throws Error 包含具体信息（哪些测试点 + 当前总和 + 缺失/多余）
 */
export function assertTotalScoreIs100(cases: TestCaseScoreInput[]): void {
  if (!Array.isArray(cases) || cases.length === 0) return
  const total = cases.reduce((sum, tc) => sum + (Number(tc?.score) || 0), 0)
  if (total !== TOTAL_SCORE) {
    throw new Error(
      `测试点总分必须为 ${TOTAL_SCORE}，实际为 ${total}（共 ${cases.length} 个测试点）`
    )
  }
}

/**
 * 兜底归一化：如果总分不是 100，重新均分
 * 用于 AI 生成、文件上传等"信任模型输出但仍需保证"场景
 */
export function normalizeTestCaseScores<T extends TestCaseScoreInput>(cases: T[]): T[] {
  if (!Array.isArray(cases) || cases.length === 0) return cases
  const total = cases.reduce((sum, tc) => sum + (Number(tc?.score) || 0), 0)
  if (total === TOTAL_SCORE) {
    return cases
  }
  // 不符合期望 — 重新均分
  return distributeTestCaseScores(cases, 'rebalance')
}

/**
 * 在保存测试点前调用此函数
 * - 若已经有合法总分（100）→ 直接返回
 * - 若没有 → 均分补足
 * 这是"安全网"，所有 API 入口都应该过这一道
 */
export function ensureTotalScoreIs100<T extends TestCaseScoreInput>(cases: T[]): T[] {
  if (!Array.isArray(cases) || cases.length === 0) return cases
  const total = cases.reduce((sum, tc) => sum + (Number(tc?.score) || 0), 0)
  if (total === TOTAL_SCORE) {
    return cases
  }
  return distributeTestCaseScores(cases, 'rebalance')
}
