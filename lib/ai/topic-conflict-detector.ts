/**
 * lib/ai/topic-conflict-detector.ts
 *
 * PRE-generation 主题间冲突检测（spec 7.2）。
 *
 * 在用户提交 AI 生成任务前，检测用户选择的多个主题间是否存在"父子包含"冗余
 * （如同时选"动态规划"+"区间 DP"，区间 DP 已被动态规划涵盖，同时选择造成冗余）。
 *
 * 设计意图：
 * - 仅作提示不阻塞——用户仍可强制提交不推荐的冲突组合
 * - 与 quality-check（POST-generation）解耦：本模块只检测主题间冗余，不评估题目质量
 * - 数据源：TOPIC_RELATIONSHIPS 元数据（可后续扩展，无需修改检测逻辑）
 */

import { TOPIC_RELATIONSHIPS } from './prompts/core/topic-relationships'

/**
 * 检测主题列表中的父子包含冗余。
 *
 * 检测规则：遍历 TOPIC_RELATIONSHIPS 中每个父主题，
 * 若 topics 同时包含该父主题 + 其任一子主题 → 报 subset 冲突。
 * 单个父主题下多个子主题同时被选时，每个子主题独立报一条冲突。
 *
 * 大小写敏感：主题名严格匹配 TOPIC_RELATIONSHIPS 的 key 和 value。
 *
 * @param topics 用户选择的主题列表
 * @returns `{ hasConflict, conflicts }`；topics 为空/null/undefined 时返回无冲突结果
 */
export function detectTopicConflict(
  topics: string[]
): {
  hasConflict: boolean
  conflicts: Array<{ type: 'subset'; parent: string; child: string; reason: string }>
} {
  if (!topics || topics.length === 0) {
    return { hasConflict: false, conflicts: [] }
  }

  // 用 Set 加速存在性查询（避免 topics 较大时 O(n) 线性查找）
  const topicSet = new Set<string>(topics)

  const conflicts: Array<{ type: 'subset'; parent: string; child: string; reason: string }> = []

  for (const parent of Object.keys(TOPIC_RELATIONSHIPS)) {
    // 父主题未被选中 → 跳过（即使子主题被选，也不构成冗余）
    if (!topicSet.has(parent)) continue

    const children = TOPIC_RELATIONSHIPS[parent] || []
    for (const child of children) {
      // 子主题未被选中 → 跳过
      if (!topicSet.has(child)) continue

      conflicts.push({
        type: 'subset',
        parent,
        child,
        reason: `主题「${parent}」已包含「${child}」，同时选择会造成冗余`,
      })
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  }
}
