/**
 * 主题 → 推荐难度反向查表（PRE-generation 主题-难度匹配建议）
 *
 * 目标：在用户选择 topics 后，根据内置映射表高亮推荐的难度档位，
 *       并检测当前所选 difficulty 是否与 topics 匹配，用于前端 UI 提示。
 *
 * 映射依据：spec 第 7.1 节 + lib/constants.ts 的 8 档难度体系（对齐洛谷）。
 * 难度类型从 lib/constants 引入，保持全站单一真相源。
 */

import type { Difficulty } from '@/lib/constants'

/**
 * 主题 → 推荐难度映射表
 *
 * 同一主题可能对应多个推荐档位（取并集），未列入的主题在调用方静默跳过。
 * 难度档位为中文常量，对齐 lib/constants.ts 的 Difficulty 类型。
 */
const TOPIC_DIFFICULTY_MAP: Record<string, Difficulty[]> = {
  // 基础语法类 → 入门
  '变量': ['入门'],
  '输入输出': ['入门'],
  '运算符': ['入门'],
  'if': ['入门'],
  '循环': ['入门'],
  '数组': ['入门'],
  '字符串基础': ['入门'],
  '函数': ['入门'],
  '结构体': ['入门'],
  'switch': ['入门'],
  '递归入门': ['入门'],

  // 基础算法类 → 普及- / 普及
  '枚举': ['普及-', '普及'],
  '模拟': ['普及-', '普及'],
  '递推': ['普及-', '普及'],
  '前缀和': ['普及-', '普及'],
  '差分': ['普及-', '普及'],
  '排序': ['普及-', '普及'],
  '二分查找': ['普及-', '普及'],
  '栈': ['普及-', '普及'],
  '队列': ['普及-', '普及'],

  // 综合算法类 → 普及 / 普及+
  '动态规划': ['普及', '普及+'],
  '背包': ['普及', '普及+'],
  'BFS': ['普及', '普及+'],
  'DFS': ['普及', '普及+'],
  'Dijkstra': ['普及', '普及+'],
  'Kruskal': ['普及', '普及+'],
  '贪心': ['普及', '普及+'],

  // 进阶算法类 → 普及+ / 提高
  '区间 DP': ['普及+', '提高'],
  '树形 DP': ['普及+', '提高'],
  '状压 DP': ['普及+', '提高'],
  '并查集': ['普及+', '提高'],
  '线段树': ['普及+', '提高'],
  '树状数组': ['普及+', '提高'],
  '单调栈': ['普及+', '提高'],

  // 高级算法类 → 提高 / 提高+
  '树链剖分': ['提高', '提高+'],
  '莫队': ['提高', '提高+'],
  'FFT': ['提高', '提高+'],
  '网络流': ['提高', '提高+'],
  '点分治': ['提高', '提高+'],
  '主席树': ['提高', '提高+'],

  // 高级数据结构类 → 提高+ / 省选
  '后缀自动机': ['提高+', '省选'],
  'LCT': ['提高+', '省选'],
  '生成函数': ['提高+', '省选'],
  '多项式': ['提高+', '省选'],
  '杜教筛': ['提高+', '省选'],
  '线性基': ['提高+', '省选'],

  // 竞赛算法类 → 省选 / NOI
  '李超树': ['省选', 'NOI'],
  '动态 DP': ['省选', 'NOI'],
  'K-D Tree': ['省选', 'NOI'],
  '矩阵树定理': ['省选', 'NOI'],
  '圆方树': ['省选', 'NOI'],

  // 顶级算法类 → NOI
  '计算几何': ['NOI'],
  '线性规划': ['NOI'],
  '博弈论': ['NOI'],
  '启发式搜索': ['NOI'],
}

/**
 * 根据主题列表返回所有推荐难度档位（去重）。
 *
 * - topics 为空数组或 null/undefined 时返回 []
 * - 多个 topics 的推荐难度取并集去重
 * - 未在映射表中的 topic 静默跳过（不报错）
 *
 * @param topics 主题数组
 * @returns 推荐难度档位列表（无序，已去重）
 */
export function getRecommendedDifficulties(topics: string[] | null | undefined): Difficulty[] {
  if (!topics || topics.length === 0) return []

  const set = new Set<Difficulty>()
  for (const topic of topics) {
    const recommended = TOPIC_DIFFICULTY_MAP[topic]
    if (recommended) {
      for (const d of recommended) set.add(d)
    }
  }
  return Array.from(set)
}

/**
 * 检测当前 topics 与所选 difficulty 是否匹配。
 *
 * - topics 为空 → { mismatch: false }（无主题时无法判断）
 * - 推荐档位列表为空（topics 都不在映射表）→ { mismatch: false }
 * - difficulty 在推荐档位列表中 → { mismatch: false }
 * - difficulty 不在推荐档位列表中 → { mismatch: true, reason: "当前主题更适合：..." }
 *
 * @param topics 主题数组
 * @param difficulty 当前所选难度档位
 * @returns 是否不匹配及原因
 */
export function getTopicDifficultyMismatch(
  topics: string[] | null | undefined,
  difficulty: string,
): { mismatch: boolean; reason?: string } {
  if (!topics || topics.length === 0) return { mismatch: false }

  const recommended = getRecommendedDifficulties(topics)
  if (recommended.length === 0) return { mismatch: false }

  if (recommended.includes(difficulty as Difficulty)) {
    return { mismatch: false }
  }

  return {
    mismatch: true,
    reason: `当前主题更适合：${recommended.join(' / ')}`,
  }
}

/**
 * 将 mismatch reason 格式化为 UI 友好文案。
 *
 * 简单实现：附加 "建议：" 前缀，便于前端直接渲染。
 *
 * @param reason getTopicDifficultyMismatch 返回的 reason 字符串
 * @returns UI 友好的提示文案
 */
export function formatMismatchReason(reason: string): string {
  if (reason.startsWith('建议：')) return reason
  return `建议：${reason}`
}
