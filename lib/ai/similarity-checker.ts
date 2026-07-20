/**
 * lib/ai/similarity-checker.ts
 *
 * 题目相似度检测模块（POST-generation 质量层，spec 7.5）。
 *
 * 基于 Jaccard 相似度算法对题目进行查重：
 * - 集合元素 = tags 集合 ∪ 标题关键词分词 ∪ 描述关键词分词
 * - 相似度 = |A ∩ B| / |A ∪ B|
 *
 * 设计意图：
 * - maxSimilarity > 0.8  → warn（提示管理员人工复核）
 * - maxSimilarity > 0.95 → FAILED（视为重复题，不入库）
 * - 阈值判定与 qualityIssues 注入由调用方（quality-check.ts）负责
 *
 * 本模块为纯函数实现，不引入 Prisma / DB 依赖；
 * 由调用方负责检索 existingProblems（含 PRE-generation 已注入候选题的排除逻辑，
 * 避免 AI 已尝试避开的题目再被双重判罚）。
 */

/** 停用词集合（中文 + 英文常见词 + OI 题目模板词） */
const STOP_WORDS = new Set<string>([
  // 中文停用词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
  // OI 题目常见模板词（无算法意义）
  '给定', '输入', '输出', '请你', '求', '其中', '对于', '数据', '范围', '保证', '示例', '样例', '说明', '注意',
  // 英文停用词
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among',
  // 题目描述常见英文模板词
  'input', 'output', 'example', 'note', 'given', 'find', 'calculate', 'print', 'read', 'write', 'problem', 'solution',
])

/** 中英文标点符号正则（分词前去除标点，替换为空格避免 token 粘连） */
const PUNCTUATION_REGEX = /[，。！？；：""''（）《》、\.,!?;:'"()\[\]{}<>\/\\@#$%^&*+=|~`]/g

/**
 * 判断 token 是否为纯数字字符串。
 *
 * 纯数字 token（如 "100"、"5"）即使长度 < 2 也保留，
 * 因为数字常代表测试数据规模或边界值，对题目相似度有区分意义。
 */
function isPureDigits(s: string): boolean {
  return /^\d+$/.test(s)
}

/**
 * 文本分词：将题目文本切分为关键词集合。
 *
 * 分词规则：
 * 1. 去除中英文标点（替换为空格，避免标点前后 token 粘连）
 * 2. 按空格 / 换行 / 制表符分词
 * 3. 转小写
 * 4. 过滤停用词
 * 5. 过滤空字符串和长度 < 2 的 token（纯数字 token 例外保留）
 *
 * @param text 原始文本（标题或描述）
 * @returns 关键词集合（已去重）
 */
export function tokenize(text: string): Set<string> {
  if (!text || typeof text !== 'string') return new Set<string>()

  // 1. 去除标点（替换为空格，避免标点前后 token 粘连）
  const cleaned = text.replace(PUNCTUATION_REGEX, ' ')

  // 2. 按空白字符分词 + 转小写
  const rawTokens = cleaned.split(/\s+/).map(t => t.toLowerCase())

  // 3. 过滤停用词 + 空字符串 + 长度 < 2 的 token（纯数字例外保留）
  const result = new Set<string>()
  for (const t of rawTokens) {
    if (!t) continue
    if (STOP_WORDS.has(t)) continue
    if (t.length < 2 && !isPureDigits(t)) continue
    result.add(t)
  }
  return result
}

/**
 * 构建题目的关键词集合（tags + 标题分词 + 描述分词的并集）。
 *
 * tags 直接作为关键词（统一转小写，便于跨题匹配）；标题与描述走 tokenize 分词。
 *
 * @param problem 题目对象（含 title / description / tags）
 * @returns 合并后的关键词集合（已去重，统一小写）
 */
export function buildTokenSet(problem: {
  title: string
  description: string
  tags: string[]
}): Set<string> {
  const result = new Set<string>()

  // tags 直接作为关键词（统一转小写，便于跨题匹配）
  for (const tag of problem.tags || []) {
    const t = String(tag || '').trim().toLowerCase()
    if (t) result.add(t)
  }

  // 标题分词
  for (const t of tokenize(problem.title || '')) {
    result.add(t)
  }

  // 描述分词
  for (const t of tokenize(problem.description || '')) {
    result.add(t)
  }

  return result
}

/**
 * 计算两个集合的 Jaccard 相似度。
 *
 * 公式：J(A, B) = |A ∩ B| / |A ∪ B|
 *
 * @param setA 集合 A
 * @param setB 集合 B
 * @returns 相似度（0-1）；若 A ∪ B 为空集返回 0（避免除零）
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0

  let intersectionCount = 0
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++
  }

  const unionCount = setA.size + setB.size - intersectionCount
  if (unionCount === 0) return 0

  return intersectionCount / unionCount
}

/**
 * 检测新题与题库已有题的相似度。
 *
 * 对每道已有题计算 Jaccard 相似度，返回最大相似度 + 最相似题目信息。
 * 仅当 maxSimilarity > 0 时填充 similarTo（避免无相似时返回空对象）。
 *
 * 阈值使用建议（spec 7.5）：
 * - maxSimilarity > 0.95 → 任务 FAILED（视为重复题，不入库）
 * - 0.8 < maxSimilarity ≤ 0.95 → warn（提示管理员人工复核）
 * - maxSimilarity ≤ 0.8 → 不加入 qualityIssues
 *
 * @param newProblem 新题（title / description / tags）
 * @param existingProblems 题库已有题列表。建议调用方在检索阶段排除
 *   PRE-generation 已注入 avoidDuplicateWith 的候选题，避免双重判罚
 * @returns `{ maxSimilarity, similarTo? }`；similarTo 仅在 maxSimilarity > 0 时填充
 */
export function checkProblemSimilarity(
  newProblem: { title: string; description: string; tags: string[] },
  existingProblems: Array<{ title: string; description: string; tags: string[] }>
): { maxSimilarity: number; similarTo?: { title: string; similarity: number } } {
  if (!existingProblems || existingProblems.length === 0) {
    return { maxSimilarity: 0 }
  }

  const newTokenSet = buildTokenSet(newProblem)

  let maxSimilarity = 0
  let mostSimilarTitle: string | null = null

  for (const existing of existingProblems) {
    if (!existing) continue
    const existingTokenSet = buildTokenSet(existing)
    const sim = jaccardSimilarity(newTokenSet, existingTokenSet)
    if (sim > maxSimilarity) {
      maxSimilarity = sim
      mostSimilarTitle = existing.title || ''
    }
  }

  if (maxSimilarity > 0 && mostSimilarTitle !== null) {
    return {
      maxSimilarity,
      similarTo: { title: mostSimilarTitle, similarity: maxSimilarity },
    }
  }

  return { maxSimilarity: 0 }
}
