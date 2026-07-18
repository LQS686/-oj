/**
 * lib/ai/prompts/shared/test-coverage-spec.ts
 *
 * 共享段：10 维测试覆盖说明（Task 40.3）
 *
 * 抽取 TestData generator 和 quality-check 中重复的 10 维测试覆盖框架，
 * 供 TestData / Incremental / ParamGen / quality-check 组合使用。
 */

/**
 * 10 维测试覆盖维度定义
 *
 * 与 quality-check.ts 的 inferCoveredDimensions 保持一致
 */
export const TEST_COVERAGE_DIMENSIONS: ReadonlyArray<{ id: string; name: string; description: string }> = [
  { id: 'a', name: '最小值', description: 'n=1 / 0 / 空输入等最小规模情形' },
  { id: 'b', name: '最大值/压力', description: '数据范围上限（如 n=10^5 / 10^6），用于压力测试' },
  { id: 'c', name: '边界条件', description: '刚好达到约束边界的值（如 n=2 刚好不退化）' },
  { id: 'd', name: '特殊/反例', description: '负数 / 小数 / 浮点 / 特殊字符等可能触发 bug 的数据' },
  { id: 'e', name: '随机典型', description: '中等规模随机数据（100-10000），验证常规正确性' },
  { id: 'f', name: '全相同', description: '所有元素相同（如全 0 / 全 1），验证退化情况处理' },
  { id: 'g', name: '严格单调', description: '严格递增 / 递减序列，验证排序/二分类算法' },
  { id: 'h', name: '极端比例', description: '极端不平衡数据（如 1 个大值 + n-1 个小值）' },
  { id: 'i', name: '倒数边界', description: '接近上限但未达上限的数据（如 n=10^5-1）' },
  { id: 'j', name: '随机压力', description: '多组随机大数据，用于压力测试与常数优化验证' },
]

/**
 * 渲染 10 维测试覆盖说明（用于 prompt 注入）
 *
 * 与 quality-gates.ts 的 renderTestCaseDimensions 保持一致
 */
export function renderTestCoverageSpec(): string {
  return TEST_COVERAGE_DIMENSIONS.map(d => `   - ${d.id}) ${d.name}：${d.description}`).join('\n')
}

/**
 * 测试覆盖质量门禁（适用于 TestData / Incremental / ParamGen）
 */
export const TEST_COVERAGE_QUALITY_GATES: ReadonlyArray<string> = [
  '至少覆盖 10 个维度中的 9 个',
  'input / output 字符串中不能包含中文字符或注释',
  '至少 1 组数据应接近数据范围上限（用于压力测试）',
  '字符串中的换行必须用 \\n 转义（不要写裸换行）',
]
