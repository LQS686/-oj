/**
 * lib/problem/testcase-scoring.ts
 * 测试用例分数分配的纯函数（客户端 + 服务端通用）
 * 不依赖 prisma/fs/path，可安全在客户端组件中 import
 */

export const TOTAL_SCORE = 100

export interface TestCaseScoreInput {
  score?: number
  [key: string]: any
}

/**
 * 均分测试点分数：每个 ≈ 100/n，余数加给前 r 个
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
      newScore = tc.score
    } else {
      newScore = base + (idx < remainder ? 1 : 0)
    }
    return { ...tc, score: newScore }
  })
}

/**
 * 校验测试点总分是否为 100
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
 */
export function normalizeTestCaseScores<T extends TestCaseScoreInput>(cases: T[]): T[] {
  if (!Array.isArray(cases) || cases.length === 0) return cases
  const total = cases.reduce((sum, tc) => sum + (Number(tc?.score) || 0), 0)
  if (total === TOTAL_SCORE) return cases
  return distributeTestCaseScores(cases, 'rebalance')
}

/**
 * 在保存测试点前调用此函数 - 安全网
 */
export function ensureTotalScoreIs100<T extends TestCaseScoreInput>(cases: T[]): T[] {
  if (!Array.isArray(cases) || cases.length === 0) return cases
  const total = cases.reduce((sum, tc) => sum + (Number(tc?.score) || 0), 0)
  if (total === TOTAL_SCORE) return cases
  return distributeTestCaseScores(cases, 'rebalance')
}
