/**
 * lib/ai/prompts/shared/duplicate-avoidance.ts
 *
 * 共享段：避免与已有题目雷同约束（PRE-generation 注入）
 *
 * 在 enqueueAiGeneration 时根据 topic + difficulty 检索题库中相同主题+难度的题目，
 * 将候选题列表（title + tags）注入 prompt 的 avoidDuplicateWith 字段，
 * AI 生成时避开雷同。
 *
 * 设计意图（与 POST-generation 质量层配合）：
 * - PRE-generation 是建议层：减少无效 AI 调用，节省 token 与时间
 * - POST-generation（quality-check）会排除 avoidDuplicateWith 已注入的候选题，
 *   避免双重判罚（AI 已尝试避开，相似度 warn 是预期的，不应再扣分）
 */

export const DUPLICATE_AVOIDANCE_SPEC = `
【避免与已有题目雷同约束】
- 避免与以下已有题目雷同：[title1 (tags) / title2 (tags) / ...]
- 雷同判定标准：相同算法核心 + 相同数据范围 + 相同 IO 格式 = 雷同
- 允许同主题但要求不同背景/不同约束/不同算法变种
`.trim()

export function renderDuplicateAvoidanceSpec(candidates: Array<{ title: string; tags: string[] }>): string {
  if (!candidates || candidates.length === 0) return ''
  const list = candidates.map(c => `${c.title} (${c.tags.join(', ')})`).join(' / ')
  return DUPLICATE_AVOIDANCE_SPEC.replace('[title1 (tags) / title2 (tags) / ...]', list)
}
