/**
 * AI 生成题目质量自检
 *
 * 目标：在生成器返回前对每条 problem 做轻量校验，失败不阻塞但记录到 qualityIssues，
 *       前端可在结果区用黄色 chip 提示。
 *
 * 校验项（不完整列表）：
 * 1. 必填字段非空
 * 2. samples.length >= 1
 * 3. test_cases.length >= 10（保证覆盖度）
 * 4. test_cases 覆盖 10 个维度中的至少 8 个（基于启发式推断）
 * 5. tags 非空
 * 6. hint 非空
 * 7. test_cases 中 input / output 字符串不包含中文字符
 * 8. difficulty 字段是合法档位
 * 9. time_limit / memory_limit 是正整数
 * 10. solution_cpp / solution_python 非空（不验证语法，仅验证存在性）
 */

import { GeneratedProblem } from './prompts/core/types'
import { isValidDifficulty, DIFFICULTIES } from '@/lib/constants'

export type QualitySeverity = 'warn' | 'error'

export interface QualityCheckResult {
  ok: boolean
  /** 第一个失败原因的简短描述 */
  reason?: string
  severity?: QualitySeverity
  /** 详细问题列表（如有） */
  details?: string[]
}

// 难度合法值从 lib/constants 引入（全站单一真相源，对齐洛谷 8 档标准）
// const VALID_DIFFICULTIES 已移除，改用 isValidDifficulty() 函数校验

/** 检测字符串是否含中文字符 */
function hasChinese(s: string | undefined | null): boolean {
  if (!s) return false
  return /[\u4e00-\u9fff]/.test(s)
}

/**
 * 启发式推断 test_cases 覆盖了哪些维度
 * 基于简单的模式匹配（如检测小数字、大数字、特殊字符等）
 *
 * Task 33.2：导出供 test_data_incremental 模式使用
 */
export function inferCoveredDimensions(testCases: any[]): { id: string; name: string }[] {
  if (!Array.isArray(testCases) || testCases.length === 0) return []

  const covered: { id: string; name: string }[] = []
  const inputs = testCases.map(tc => String(tc?.input || ''))
  const outputs = testCases.map(tc => String(tc?.output || ''))
  const allText = inputs.join('|') + '||' + outputs.join('|')

  // (a) 最小值 — 检测 n=1 / 0 / 空
  if (/\bn\s*[:\s=]\s*[01]\b|^\s*0\s*$/m.test(allText) ||
      inputs.some(i => /^[01](\s|$)/.test(i.trim()))) {
    covered.push({ id: 'a', name: '最小值' })
  }

  // (b) 最大值/压力 — 检测大数字（>= 1e5）
  if (inputs.some(i => /(1[0-9]{5,}|9[0-9]{5,})/.test(i))) {
    covered.push({ id: 'b', name: '最大值/压力' })
  }

  // (c) 边界条件 — 难精确检测，宽松判断：若 input 含 1 或 0，认为可能覆盖
  if (inputs.some(i => /(^|\s)[01](\s|$)/.test(i))) {
    covered.push({ id: 'c', name: '边界条件' })
  }

  // (d) 特殊/反例 — 含负数 / 小数 / 浮点
  if (/-\d|\d\.\d/.test(allText)) {
    covered.push({ id: 'd', name: '特殊/反例' })
  }

  // (e) 随机典型 — 中等规模数字（100-10000）
  if (inputs.some(i => /\b([1-9][0-9]{2,3}|[1-9][0-9]{4,5})\b/.test(i))) {
    covered.push({ id: 'e', name: '随机典型' })
  }

  // (f) 全相同 — 难精确检测，宽松判断：若有至少 3 组
  if (testCases.length >= 3) {
    covered.push({ id: 'f', name: '全相同' })
  }

  // (g) 严格单调 — 难精确检测，宽松判断：若有至少 5 组
  if (testCases.length >= 5) {
    covered.push({ id: 'g', name: '严格单调' })
  }

  // (h) 极端比例 — 难精确检测，宽松判断：若有至少 8 组
  if (testCases.length >= 8) {
    covered.push({ id: 'h', name: '极端比例' })
  }

  // (i) 倒数边界 — 难精确检测，宽松判断：若有至少 12 组
  if (testCases.length >= 12) {
    covered.push({ id: 'i', name: '倒数边界' })
  }

  // (j) 随机压力 — 难精确检测，宽松判断：若有至少 15 组
  if (testCases.length >= 15) {
    covered.push({ id: 'j', name: '随机压力' })
  }

  return covered
}

/** 校验单条 problem */
export function checkGeneratedProblem(p: any): QualityCheckResult {
  const issues: string[] = []
  if (!p || typeof p !== 'object') {
    return { ok: false, reason: 'problem 不是对象', severity: 'error' }
  }

  // 必填字段
  const required = ['title', 'description', 'input', 'output', 'difficulty']
  for (const f of required) {
    if (!p[f] || (typeof p[f] === 'string' && p[f].trim() === '')) {
      issues.push(`字段 ${f} 缺失或为空`)
    }
  }

  // samples
  if (!Array.isArray(p.samples) || p.samples.length < 1) {
    issues.push('samples 不足 1 组')
  }

  // test_cases 数量下限（10 为硬下限，15 为推荐值；与 prompt 一致）
  if (!Array.isArray(p.test_cases) || p.test_cases.length < 10) {
    issues.push(`test_cases 不足 10 组（实际 ${Array.isArray(p.test_cases) ? p.test_cases.length : 0}）`)
  } else if (p.test_cases.length < 15) {
    issues.push(`test_cases 数量偏少（${p.test_cases.length} 组），建议至少 15 组以保证覆盖度`)
  }

  // test_cases 覆盖维度启发式校验
  if (Array.isArray(p.test_cases) && p.test_cases.length >= 5) {
    const covered = inferCoveredDimensions(p.test_cases)
    if (covered.length < 8) {
      const allDimensions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
      const missing = allDimensions.filter(id => !covered.find(c => c.id === id))
      issues.push(`test_cases 覆盖维度不足 8 个（实际 ${covered.length}），缺失：${missing.join(', ')}`)
    }
  }

  // tags
  if (!Array.isArray(p.tags) || p.tags.length === 0) {
    issues.push('tags 数组为空')
  }

  // hint
  if (!p.hint || (typeof p.hint === 'string' && p.hint.trim() === '')) {
    issues.push('hint 字段为空')
  }

  // difficulty 取值合法（8 档标准，来自 lib/constants）
  if (p.difficulty && !isValidDifficulty(p.difficulty)) {
    issues.push(`difficulty "${p.difficulty}" 不在合法档位列表中（${DIFFICULTIES.join(' / ')}）`)
  }

  // time_limit / memory_limit 是正整数
  if (p.time_limit !== undefined && (typeof p.time_limit !== 'number' || p.time_limit <= 0 || !Number.isInteger(p.time_limit))) {
    issues.push('time_limit 不是正整数')
  }
  if (p.memory_limit !== undefined && (typeof p.memory_limit !== 'number' || p.memory_limit <= 0 || !Number.isInteger(p.memory_limit))) {
    issues.push('memory_limit 不是正整数')
  }

  // test_cases 内不能含中文字符
  if (Array.isArray(p.test_cases)) {
    p.test_cases.forEach((tc: any, idx: number) => {
      if (tc && (hasChinese(tc.input) || hasChinese(tc.output))) {
        issues.push(`test_cases[${idx}] 包含中文字符`)
      }
    })
  }

  if (issues.length === 0) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: issues[0],
    severity: 'warn',
    details: issues
  }
}

/** 校验 TestDataGen 模式返回的 testCases */
export function checkTestDataQuality(testCases: any[]): QualityCheckResult {
  const issues: string[] = []
  if (!Array.isArray(testCases)) {
    return { ok: false, reason: 'testCases 不是数组', severity: 'error' }
  }
  if (testCases.length === 0) {
    return { ok: false, reason: 'testCases 为空', severity: 'error' }
  }
  // 数量下限（10）
  if (testCases.length < 10) {
    issues.push(`testCases 不足 10 组（实际 ${testCases.length}），建议至少 15 组以保证覆盖度`)
  }
  // 覆盖维度校验
  if (testCases.length >= 5) {
    const covered = inferCoveredDimensions(testCases)
    if (covered.length < 8) {
      const allDimensions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
      const missing = allDimensions.filter(id => !covered.find(c => c.id === id))
      issues.push(`testCases 覆盖维度不足 8 个（实际 ${covered.length}），缺失：${missing.join(', ')}`)
    }
  }
  testCases.forEach((tc: any, idx: number) => {
    if (!tc || typeof tc !== 'object') {
      issues.push(`testCases[${idx}] 不是对象`)
      return
    }
    if (typeof tc.input !== 'string') issues.push(`testCases[${idx}].input 不是字符串`)
    if (typeof tc.output !== 'string') issues.push(`testCases[${idx}].output 不是字符串`)
    if (hasChinese(tc.input)) issues.push(`testCases[${idx}].input 包含中文字符`)
    if (hasChinese(tc.output)) issues.push(`testCases[${idx}].output 包含中文字符`)
  })
  if (issues.length === 0) return { ok: true }
  return { ok: false, reason: issues[0], severity: 'warn', details: issues }
}

/* ============================================================================
 * Phase 6：质量评分（题解 + 测试数据强度）
 * ========================================================================== */

/**
 * 题解质量评分结果（Task 31.1）
 *
 * 5 维度评分，每维 0-5 分，综合分 = 加权平均（0-5）：
 * - completeness 完整性：5 段是否齐全
 * - accuracy 准确性：算法描述是否正确（基于标程存在性推断）
 * - readability 可读性：markdown 结构 / 代码块格式
 * - codeMatch 标程匹配度：参考代码与标程语言是否一致
 * - difficultyMatch 难度匹配度：题解深度是否匹配难度档位
 */
export interface SolutionQualityScore {
  completeness: number
  accuracy: number
  readability: number
  codeMatch: number
  difficultyMatch: number
  /** 综合分（0-5，加权平均） */
  overall: number
  /** 评分依据说明 */
  notes: string[]
}

const SOLUTION_REQUIRED_SECTIONS = ['思路分析', '算法描述', '复杂度分析', '参考代码', '关键点说明']

/**
 * 题解质量评分（Task 31.1）
 *
 * 基于 AI 返回的题解内容 + 可选的标程信息，做 5 维度评分。
 * 评分规则轻量启发式（不调 AI），用于快速过滤低质量题解。
 *
 * @param result AI 题解生成结果（content / language / qualityScores）
 * @param stdLang 标程语言（用于 codeMatch 维度）
 * @param difficulty 题目难度（用于 difficultyMatch 维度）
 */
export function scoreSolutionQuality(
  result: { content?: string; language?: string; qualityScores?: Record<string, number> },
  stdLang?: string,
  difficulty?: string
): SolutionQualityScore {
  const notes: string[] = []
  const content = (result?.content || '').trim()

  // 1. 完整性：5 段 H2 标题出现数量
  const presentSections = SOLUTION_REQUIRED_SECTIONS.filter(s => content.includes(s))
  const completeness = Math.round((presentSections.length / SOLUTION_REQUIRED_SECTIONS.length) * 5)
  if (presentSections.length < SOLUTION_REQUIRED_SECTIONS.length) {
    notes.push(`缺失段落：${SOLUTION_REQUIRED_SECTIONS.filter(s => !presentSections.includes(s)).join('、')}`)
  }

  // 2. 准确性：有标程代码块 + 有复杂度分析 => 较高分
  const hasCodeBlock = /```[a-z]*\n[\s\S]+?\n```/.test(content)
  const hasComplexity = /O\([nN\d\w\s+\^]+\)/.test(content)
  let accuracy = 0
  if (hasCodeBlock) accuracy += 3
  if (hasComplexity) accuracy += 2
  accuracy = Math.min(accuracy, 5)
  if (!hasCodeBlock) notes.push('未检测到代码块')

  // 3. 可读性：markdown 结构标记密度（H2 / 列表 / 代码块）
  const h2Count = (content.match(/^##\s/gm) || []).length
  const listCount = (content.match(/^[-*]\s/gm) || []).length
  let readability = 0
  if (h2Count >= 5) readability += 2
  else if (h2Count >= 3) readability += 1
  if (listCount >= 3) readability += 2
  else if (listCount >= 1) readability += 1
  if (content.length >= 500) readability += 1
  readability = Math.min(readability, 5)

  // 4. 标程匹配度：参考代码语言与标程语言是否一致
  let codeMatch = 3 // 默认中等
  const detectedLang = result.language || ''
  if (stdLang && detectedLang) {
    if (detectedLang.toLowerCase().includes(stdLang.toLowerCase()) ||
        stdLang.toLowerCase().includes(detectedLang.toLowerCase())) {
      codeMatch = 5
    } else {
      codeMatch = 2
      notes.push(`语言不匹配：标程 ${stdLang}，题解 ${detectedLang}`)
    }
  } else if (!stdLang) {
    codeMatch = 4 // 无标程时不扣分
  }

  // 5. 难度匹配度：高难度题解应更长 + 有复杂度分析
  let difficultyMatch = 4
  const highDiff = ['提高', '提高+', '省选', 'NOI']
  if (difficulty && highDiff.some(d => difficulty.includes(d))) {
    if (content.length < 800) {
      difficultyMatch = 2
      notes.push('高难度题解题解过短')
    } else if (hasComplexity) {
      difficultyMatch = 5
    } else {
      difficultyMatch = 3
    }
  } else if (content.length < 300) {
    difficultyMatch = 3
    notes.push('题解内容偏短')
  }

  // 如果 AI 自评了 qualityScores，综合参考
  const aiScores = result.qualityScores
  if (aiScores && typeof aiScores === 'object') {
    // AI 自评分作为辅助参考，不直接覆盖启发式评分
    notes.push('AI 自评分已记录，作为辅助参考')
  }

  // 综合分：加权平均（完整性 25% / 准确性 25% / 可读性 20% / 标程匹配 15% / 难度匹配 15%）
  const overall = Math.round(
    (completeness * 0.25 + accuracy * 0.25 + readability * 0.20 + codeMatch * 0.15 + difficultyMatch * 0.15) * 10
  ) / 10

  return {
    completeness,
    accuracy,
    readability,
    codeMatch,
    difficultyMatch,
    overall,
    notes,
  }
}

/**
 * 测试数据强度评分结果（Task 34.1）
 *
 * 评分 0-100：
 * - 10 维覆盖 80 分（每维 8 分）
 * - 边界覆盖 20 分（最小值 / 最大值 / 特殊反例各占权重）
 */
export interface TestdataStrengthScore {
  /** 0-100 */
  overall: number
  /** 维度覆盖得分（0-80） */
  coverageScore: number
  /** 边界覆盖得分（0-20） */
  boundaryScore: number
  /** 已覆盖维度 */
  coveredDimensions: Array<{ id: string; name: string }>
  /** 缺失维度 */
  missingDimensions: Array<{ id: string; name: string }>
  /** 评分说明 */
  notes: string[]
}

const ALL_DIMENSIONS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

/**
 * 测试数据强度评分（Task 34.1）
 *
 * 基于 10 维覆盖框架 + 边界覆盖情况，给出 0-100 的强度评分。
 * - 10 维覆盖 80 分（每维 8 分）
 * - 边界覆盖 20 分（最小值 / 最大值 / 特殊反例 / 数量充足度）
 */
export function scoreTestdataStrength(testCases: any[]): TestdataStrengthScore {
  const notes: string[] = []

  if (!Array.isArray(testCases) || testCases.length === 0) {
    return {
      overall: 0,
      coverageScore: 0,
      boundaryScore: 0,
      coveredDimensions: [],
      missingDimensions: ALL_DIMENSIONS.map(id => ({ id, name: DIMENSION_NAMES[id] || id })),
      notes: ['测试数据为空'],
    }
  }

  const covered = inferCoveredDimensions(testCases)
  const coveredIds = new Set(covered.map(d => d.id))
  const missing = ALL_DIMENSIONS
    .filter(id => !coveredIds.has(id))
    .map(id => ({ id, name: DIMENSION_NAMES[id] || id }))

  // 维度覆盖得分：每维 8 分，共 80 分
  const coverageScore = covered.length * 8

  // 边界覆盖得分（20 分）：
  // - 最小值覆盖（a）：+5（已在 coverageScore 中计入，这里看是否有真正的 n=0/1）
  // - 最大值覆盖（b）：+5
  // - 特殊反例（d）：+5
  // - 数量充足（>= 15 组）：+5
  let boundaryScore = 0
  const inputs = testCases.map(tc => String(tc?.input || ''))
  const outputs = testCases.map(tc => String(tc?.output || ''))
  const allText = inputs.join('|') + '||' + outputs.join('|')

  if (/\bn\s*[:\s=]\s*[01]\b|^\s*0\s*$/m.test(allText) || inputs.some(i => /^[01](\s|$)/.test(i.trim()))) {
    boundaryScore += 5
  }
  if (inputs.some(i => /(1[0-9]{5,}|9[0-9]{5,})/.test(i))) {
    boundaryScore += 5
  }
  if (/-\d|\d\.\d/.test(allText)) {
    boundaryScore += 5
  }
  if (testCases.length >= 15) {
    boundaryScore += 5
  } else if (testCases.length >= 10) {
    boundaryScore += 3
    notes.push(`测试点数量偏少（${testCases.length} 组），建议至少 15 组`)
  } else {
    notes.push(`测试点数量不足（${testCases.length} 组）`)
  }

  const overall = Math.min(100, coverageScore + boundaryScore)

  if (missing.length > 0) {
    notes.push(`缺失维度：${missing.map(d => d.name).join('、')}`)
  }

  return {
    overall,
    coverageScore,
    boundaryScore,
    coveredDimensions: covered,
    missingDimensions: missing,
    notes,
  }
}

/** 10 维度名称映射（与 inferCoveredDimensions 保持一致） */
const DIMENSION_NAMES: Record<string, string> = {
  a: '最小值',
  b: '最大值/压力',
  c: '边界条件',
  d: '特殊/反例',
  e: '随机典型',
  f: '全相同',
  g: '严格单调',
  h: '极端比例',
  i: '倒数边界',
  j: '随机压力',
}
