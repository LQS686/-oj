/**
 * AI 生成题目质量自检
 *
 * 目标：在生成器返回前对每条 problem 做轻量校验，失败不阻塞但记录到 qualityIssues，
 *       前端可在结果区用黄色 chip 提示。
 *
 * 校验项（不完整列表）：
 * 1. 必填字段非空
 * 2. samples.length >= 1
 * 3. test_cases.length >= 8（保证覆盖度；Task 7.1：硬下限 10 → 8，删除 < 15 提醒）
 * 4. test_cases 覆盖 10 个维度中的至少 9 个（Task 7.3：基于启发式推断，< 9 warn / < 7 error）
 * 5. tags 非空
 * 6. hint 非空
 * 7. test_cases 中 input / output 字符串不包含中文字符
 * 8. difficulty 字段是合法档位
 * 9. time_limit / memory_limit 是正整数
 * 10. solution_cpp / solution_python 非空（不验证语法，仅验证存在性）
 *
 * Task 7 扩展（spec 第 6.5 节）：
 * - 7.2 歧义检测（仅 warn 不阻塞）：模糊词 / 未明确数据范围 / 样例解释过短
 * - 7.4 综合质量评分 calculateQualityScore（5 维度 0-100，< 60 FAILED）
 * - 7.6 评分阈值：>= 80 pass / 60-80 warn / < 60 FAILED
 * - 7.8 相似度检测集成（maxSimilarity > 0.95 FAILED / > 0.8 warn）
 * - 7.9 排除 PRE-generation 已注入的候选相似题（avoidDuplicateWith）
 */

import { GeneratedProblem } from './prompts/core/types'
import { isValidDifficulty, DIFFICULTIES } from '@/lib/constants'
import type { Difficulty } from '@/lib/constants'
import { DIFFICULTY_PROFILES } from './prompts/core/quality-gates'
import { checkProblemSimilarity } from './similarity-checker'
import { prisma } from '@/lib/prisma'

export type QualitySeverity = 'warn' | 'error'

export interface QualityCheckResult {
  ok: boolean
  /** 第一个失败原因的简短描述 */
  reason?: string
  severity?: QualitySeverity
  /** 详细问题列表（如有） */
  details?: string[]
  /** 综合质量评分（0-100，5 维度各 0-20 加权，Task 7.4/7.5） */
  qualityScore?: number
  /** 题目相似度（0-1，越大越相似；Task 7.5/7.8——仅在传入 existingProblems 时填充） */
  similarityScore?: number
}

/** 单条歧义检测结果（Task 7.2，仅 warn） */
export interface AmbiguityIssue {
  severity: 'warn'
  message: string
}

/** 综合质量评分明细（Task 7.4） */
export interface QualityScoreBreakdown {
  /** 综合分（0-100，5 维度各 0-20 加权） */
  overall: number
  /** 原创性（0-20） */
  originality: number
  /** 难度匹配（0-20，仅作评分参考，不单独触发 FAILED） */
  difficultyMatch: number
  /** 教育价值（0-20） */
  educationalValue: number
  /** 题面质量（0-20） */
  descriptionQuality: number
  /** 标程质量（0-20） */
  solutionQuality: number
  /** 评分依据说明 */
  notes: string[]
}

/** 相似度检测阈值（Task 7.8） */
export const SIMILARITY_FAILED_THRESHOLD = 0.95
export const SIMILARITY_WARN_THRESHOLD = 0.8

/** 综合质量评分阈值（Task 7.6） */
export const QUALITY_SCORE_PASS_THRESHOLD = 80
export const QUALITY_SCORE_FAILED_THRESHOLD = 60

/** 经典题关键词列表（原创性扣分用，每命中一个扣 4 分，最多扣 20 分） */
const CLASSIC_PROBLEM_KEYWORDS = [
  '斐波那契', '汉诺塔', '八皇后', '背包', '最长公共子序列', '最长上升子序列',
  '编辑距离', '快速排序', '归并排序', '堆排序', 'Dijkstra', 'Floyd',
  'Kruskal', 'Prim', '线段树', '树状数组', 'KMP', 'AC 自动机',
  '后缀数组', 'Manacher', '快速幂', '欧几里得', 'Prim',
]

/** 翻译腔关键词（题面质量扣分用，命中扣 5 分） */
const TRANSLATION_STYLE_KEYWORDS = ['你将得到', '请输出', '请你输出', '你需要', '你的任务是']

/** 题目描述模糊词（歧义检测用，Task 7.2） */
const AMBIGUOUS_WORDS = ['或其他', '之类', '类似', '等等', '诸如此类']

/** 算法关键词（教育价值评分用，识别算法考点是否明确） */
const ALGORITHM_KEYWORDS = [
  'DP', '动态规划', '贪心', '图论', '搜索', 'DFS', 'BFS', '树', '字符串',
  '数论', '几何', '递归', '分治', '排序', '二分', '递推', '前缀和',
  '并查集', '线段树', '树状数组', 'KMP', 'Trie', 'AC 自动机', '网络流',
  '状压', '树形', '区间', '数位', '概率',
]

/** 标程质量评分时需排除的 C++ 保留字 / 标准库标识符（单字母变量占比统计用） */
const CPP_RESERVED_IDENTIFIERS = new Set([
  'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'string', 'return',
  'if', 'else', 'for', 'while', 'const', 'constexpr', 'include', 'using',
  'namespace', 'std', 'cin', 'cout', 'endl', 'main', 'auto', 'vector', 'map',
  'set', 'queue', 'stack', 'pair', 'struct', 'class', 'public', 'private',
  'true', 'false', 'nullptr', 'size_t', 'unsigned', 'short', 'signed',
  'static', 'do', 'break', 'continue', 'switch', 'case', 'default', 'new',
  'delete', 'this', 'template', 'typename', 'sizeof', 'i', 'j', 'k',
  'printf', 'scanf', 'puts', 'getchar', 'putchar', 'typedef', 'define',
  'pragma', 'push_back', 'pop_back', 'size', 'empty', 'begin', 'end',
  'first', 'second', 'make_pair', 'sort', 'reverse', 'max', 'min', 'abs',
])

// 难度合法值从 lib/constants 引入（全站单一真相源，对齐洛谷 8 档标准）
// const VALID_DIFFICULTIES 已移除，改用 isValidDifficulty() 函数校验

/** 检测字符串是否含中文字符 */
function hasChinese(s: string | undefined | null): boolean {
  if (!s) return false
  return /[\u4e00-\u9fff]/.test(s)
}

/**
 * 维度覆盖判定 helper（基于实际数据特征，不依赖数量）
 *
 * 业务决策（2026-07）：覆盖度判定必须基于 input 中真实体现的数据特征，
 * 不能用 testCases.length 推断——否则 AI 凑数量就能蒙混过关，违背"覆盖优先于数量"原则。
 */

// (f) 全相同 — input 中存在 >= 3 个连续相同 token（如 "5 5 5 5"）
function hasAllSameTokens(input: string): boolean {
  const tokens = input.trim().split(/\s+/).filter(t => t.length > 0)
  if (tokens.length < 3) return false
  for (let i = 0; i <= tokens.length - 3; i++) {
    if (tokens[i] === tokens[i + 1] && tokens[i + 1] === tokens[i + 2]) return true
  }
  return false
}

// (g) 严格单调 — input 中存在长度 >= 3 的严格递增或递减子序列（如 "1 2 3" / "5 4 3"）
function hasMonotonicSequence(input: string): boolean {
  const tokens = input.trim().split(/\s+/).map(Number).filter(n => !Number.isNaN(n))
  if (tokens.length < 3) return false
  for (let i = 0; i <= tokens.length - 3; i++) {
    const a = tokens[i], b = tokens[i + 1], c = tokens[i + 2]
    if ((a < b && b < c) || (a > b && b > c)) return true
  }
  return false
}

// (h) 极端比例 — 同时存在极小值（0/1）和极大值（>= 1e5）
function hasExtremeRatio(inputs: string[], allText: string): boolean {
  const hasSmall = inputs.some(i => /(^|\s)[01](\s|$)/.test(i))
  const hasLarge = /\b[1-9]\d{5,}\b/.test(allText)
  return hasSmall && hasLarge
}

// (i) 倒数边界 — 存在接近常见数据范围上限的值（如 99999 / 100000 / 100001 / 999999）
function hasNearUpperBound(allText: string): boolean {
  return /\b(9{4,}|10{4,}|99999|100000|100001|999999|1000000|9999999|10000000)\b/.test(allText)
}

// (j) 随机压力 — 存在 >= 3 个不同的大数字（>= 1e4），体现"多个不同压力点"
function hasMultipleLargeDistinctNumbers(inputs: string[]): boolean {
  const largeSet = new Set<number>()
  for (const input of inputs) {
    const matches = input.match(/\b\d{5,}\b/g) || []
    for (const m of matches) {
      const n = parseInt(m, 10)
      if (n >= 10000) largeSet.add(n)
      if (largeSet.size >= 3) return true
    }
  }
  return false
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

  // (f) 全相同 — input 中存在 >= 3 个连续相同 token（如 "5 5 5 5"）
  if (inputs.some(hasAllSameTokens)) {
    covered.push({ id: 'f', name: '全相同' })
  }

  // (g) 严格单调 — input 中存在长度 >= 3 的严格递增/递减子序列
  if (inputs.some(hasMonotonicSequence)) {
    covered.push({ id: 'g', name: '严格单调' })
  }

  // (h) 极端比例 — 同时存在极小值（0/1）和极大值（>= 1e5）
  if (hasExtremeRatio(inputs, allText)) {
    covered.push({ id: 'h', name: '极端比例' })
  }

  // (i) 倒数边界 — 存在接近常见数据范围上限的值
  if (hasNearUpperBound(allText)) {
    covered.push({ id: 'i', name: '倒数边界' })
  }

  // (j) 随机压力 — 存在 >= 3 个不同的大数字（>= 1e4）
  if (hasMultipleLargeDistinctNumbers(inputs)) {
    covered.push({ id: 'j', name: '随机压力' })
  }

  return covered
}

/**
 * 题目歧义检测（Task 7.2）
 *
 * 仅作 warn 不阻塞入库——管理员可在预览阶段人工复核。
 * 检测规则：
 * - 题目描述中含"或其他"/"之类"/"类似"/"等等"等模糊词 → warn（每命中一个词报一条）
 * - 输入输出格式描述中未明确数据范围（无 `1 ≤` / `≤ ` / `范围` 字样）→ warn
 * - 样例解释为空或过短（< 20 字符）→ warn
 *
 * @param p 题目对象（含 description / input / output / samples）
 * @returns 歧义问题列表（仅含 severity='warn' 项）
 */
export function detectAmbiguity(p: any): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = []
  if (!p || typeof p !== 'object') return issues

  const description = String(p.description || '')
  const input = String(p.input || '')
  const output = String(p.output || '')

  // 1. 模糊词检测（每命中一个词报一条）
  for (const word of AMBIGUOUS_WORDS) {
    if (description.includes(word)) {
      issues.push({
        severity: 'warn',
        message: `题目描述含模糊词「${word}」，建议明确化以避免歧义`,
      })
    }
  }

  // 2. 输入输出格式中未明确数据范围
  // 命中 "1 ≤" / "≤ 数字" / "范围" 任一即视为已明确
  const rangePattern = /1\s*≤|≤\s*\d|范围|数据范围/
  const ioText = input + '\n' + output
  if (ioText.trim() && !rangePattern.test(ioText)) {
    issues.push({
      severity: 'warn',
      message: '输入输出格式描述中未明确数据范围（建议补充如「1 ≤ n ≤ 10^5」的约束说明）',
    })
  }

  // 3. 样例解释为空或过短（< 20 字符）
  if (Array.isArray(p.samples)) {
    p.samples.forEach((s: any, idx: number) => {
      const explanation = s && typeof s === 'object' ? String(s.explanation || '') : ''
      if (!explanation || explanation.trim().length < 20) {
        issues.push({
          severity: 'warn',
          message: `样例 ${idx + 1} 的解释为空或过短（< 20 字符），建议补充关键步骤说明`,
        })
      }
    })
  }

  return issues
}

/**
 * 综合质量评分（Task 7.4）
 *
 * 5 维度评分，每维 0-20 分，总分 0-100：
 * - 原创性（0-20）：检测经典题关键词扣分（每命中一个扣 4 分，最多扣 20 分）；无经典题关键词则满分
 * - 难度匹配（0-20）：检测 difficulty 与算法考点匹配度。**仅作评分参考，不单独触发 FAILED**——
 *   PRE-generation 已让用户选择难度，POST-generation 不因难度不匹配 FAILED，避免与用户决策冲突；
 *   难度匹配扣分仅降低 qualityScore 总分，不会单独 FAILED
 * - 教育价值（0-20）：纯计算题（无算法关键词）扣 10 分；算法考点明确加分（满分 20）
 * - 题面质量（0-20）：描述长度 < 100 字扣 5 分，> 800 字扣 5 分；翻译腔扣 5 分
 * - 标程质量（0-20）：main 行数 > 50 行扣 5 分；magic number > 3 个扣 5 分；单字母变量占比 > 30% 扣 5 分
 *
 * @param p 题目对象（含 description / tags / difficulty / solution_cpp）
 * @returns 综合评分 + 各维度分项 + 评分说明
 */
export function calculateQualityScore(p: any): QualityScoreBreakdown {
  if (!p || typeof p !== 'object') {
    return {
      overall: 0,
      originality: 0,
      difficultyMatch: 0,
      educationalValue: 0,
      descriptionQuality: 0,
      solutionQuality: 0,
      notes: ['题目对象缺失'],
    }
  }

  const notes: string[] = []
  const description = String(p.description || '')
  const tags: string[] = Array.isArray(p.tags) ? p.tags.map((t: any) => String(t)) : []
  const difficulty = String(p.difficulty || '')
  const solution = String(p.solution_cpp || '')

  // 1. 原创性（0-20）：经典题关键词扣分（每命中一个扣 4 分，最多扣 20 分）
  let originality = 20
  const matchedClassic = CLASSIC_PROBLEM_KEYWORDS.filter(kw =>
    description.includes(kw) || tags.some(t => t.includes(kw))
  )
  if (matchedClassic.length > 0) {
    originality = Math.max(0, 20 - matchedClassic.length * 4)
    notes.push(`原创性扣分：命中经典题关键词「${matchedClassic.join('、')}」`)
  }

  // 2. 难度匹配（0-20，仅作评分参考，不单独触发 FAILED）
  let difficultyMatch = 10
  const profile = DIFFICULTY_PROFILES[difficulty as Difficulty]
  if (profile) {
    const matchedAlgo = profile.algorithmExamples.some(algo =>
      tags.some(t => t.includes(algo)) || description.includes(algo)
    )
    if (matchedAlgo) {
      difficultyMatch = 20
    } else {
      difficultyMatch = 10
      notes.push(`难度匹配扣分：tags 中未检测到「${difficulty}」档位典型算法（仅作评分参考，不单独触发 FAILED）`)
    }
  } else {
    notes.push(`难度匹配：未识别 difficulty 档位「${difficulty}」（仅作评分参考）`)
  }

  // 3. 教育价值（0-20）：纯计算题扣 10 分；算法考点明确加分（满分 20）
  let educationalValue = 20
  const hasAlgorithmKeyword = tags.some(t => {
    // 排除纯难度档位标签（"入门"/"普及"/"提高"等不算算法关键词）
    if (DIFFICULTIES.includes(t as Difficulty)) return false
    return ALGORITHM_KEYWORDS.some(kw => t.includes(kw) || t.toLowerCase().includes(kw.toLowerCase()))
  })
  if (!hasAlgorithmKeyword) {
    educationalValue = 10
    notes.push('教育价值扣分：tags 中未检测到明确算法考点，疑似纯计算题')
  }

  // 4. 题面质量（0-20）：描述长度 + 翻译腔
  let descriptionQuality = 20
  if (description.length < 100) {
    descriptionQuality -= 5
    notes.push(`题面质量扣分：描述过短（${description.length} 字 < 100）`)
  }
  if (description.length > 800) {
    descriptionQuality -= 5
    notes.push(`题面质量扣分：描述过长（${description.length} 字 > 800）`)
  }
  const matchedTranslation = TRANSLATION_STYLE_KEYWORDS.filter(kw => description.includes(kw))
  if (matchedTranslation.length > 0) {
    descriptionQuality -= 5
    notes.push(`题面质量扣分：含翻译腔关键词「${matchedTranslation.join('、')}」`)
  }
  descriptionQuality = Math.max(0, descriptionQuality)

  // 5. 标程质量（0-20）：main 行数 + magic number + 单字母变量占比
  let solutionQuality = 20
  if (solution) {
    // main 行数（粗略提取 main 函数体）
    const mainMatch = solution.match(/int\s+main\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/m)
    const mainBody = mainMatch ? mainMatch[1] : ''
    const mainLines = mainBody
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('//'))
      .length
    if (mainLines > 50) {
      solutionQuality -= 5
      notes.push(`标程质量扣分：main 函数行数过多（${mainLines} 行 > 50）`)
    }

    // magic number（标程中纯数字字面量，排除 0/1，> 3 个扣 5 分）
    const allNumbers = solution.match(/\b[2-9]\d*\b/g) || []
    const uniqueMagic = new Set(allNumbers.filter(n => parseInt(n, 10) >= 2))
    if (uniqueMagic.size > 3) {
      solutionQuality -= 5
      notes.push(`标程质量扣分：magic number 过多（${uniqueMagic.size} 个 > 3）`)
    }

    // 单字母变量占比（除 i/j/k，> 30% 扣 5 分）
    const allIdentifiers = (solution.match(/\b[a-zA-Z_]\w*\b/g) || [])
      .filter(v => !CPP_RESERVED_IDENTIFIERS.has(v))
    const singleLetterVars = allIdentifiers.filter(v => v.length === 1)
    if (allIdentifiers.length > 0 && singleLetterVars.length / allIdentifiers.length > 0.3) {
      solutionQuality -= 5
      notes.push('标程质量扣分：单字母变量占比过高（> 30%，除 i/j/k）')
    }
    solutionQuality = Math.max(0, solutionQuality)
  } else {
    solutionQuality = 0
    notes.push('标程质量：solution_cpp 缺失（0 分）')
  }

  const overall = Math.max(
    0,
    Math.min(
      100,
      originality + difficultyMatch + educationalValue + descriptionQuality + solutionQuality
    )
  )

  return {
    overall,
    originality,
    difficultyMatch,
    educationalValue,
    descriptionQuality,
    solutionQuality,
    notes,
  }
}

/**
 * 校验单条 problem（Task 7 综合改造）
 *
 * 改造点：
 * - 7.1 test_cases 数量硬下限 10 → 8；删除 < 15 提醒分支
 * - 7.3 10 维覆盖度严格检测（< 9 warn / < 7 error）
 * - 7.7 集成歧义检测（仅 warn）+ 综合质量评分
 * - 7.6 评分阈值：>= 80 pass / 60-80 warn / < 60 FAILED
 * - 7.8 相似度检测集成（仅在 options.existingProblems 传入时执行）
 * - 7.9 排除 PRE-generation 已注入的候选相似题（options.avoidDuplicateWith）
 *
 * @param p 题目对象
 * @param options 可选参数：
 *   - avoidDuplicateWith: PRE-generation 已注入的候选相似题（在 existingProblems 中排除）
 *   - existingProblems: 题库已有题目列表（由调用方通过 checkProblemSimilarityFromDb 预先查询后传入；
 *     不传则 similarityScore=0，相似度检测不执行）
 */
export function checkGeneratedProblem(
  p: any,
  options?: {
    /** PRE-generation 已注入的候选相似题（POST-generation 检测时排除，避免双重判罚，Task 7.9） */
    avoidDuplicateWith?: Array<{ title: string; tags: string[] }>;
    /** 已入库题目列表（由调用方通过 checkProblemSimilarityFromDb 预先查询后传入；
     *  不传则 similarityScore=0，相似度检测不执行，Task 7.8） */
    existingProblems?: Array<{ title: string; description: string; tags: string[] }>;
  }
): QualityCheckResult {
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

  // test_cases 数量下限（Task 7.1：硬下限 10 → 8，删除 < 15 提醒）
  if (!Array.isArray(p.test_cases) || p.test_cases.length < 8) {
    issues.push(`test_cases 不足 8 组（实际 ${Array.isArray(p.test_cases) ? p.test_cases.length : 0}）`)
  }

  // 10 维覆盖度严格检测（Task 7.3：< 9 warn / < 7 error）
  let coverageError = false
  if (Array.isArray(p.test_cases) && p.test_cases.length > 0) {
    const covered = inferCoveredDimensions(p.test_cases)
    const allDimensions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const missing = allDimensions.filter(id => !covered.find(c => c.id === id))
    if (covered.length < 7) {
      coverageError = true
      issues.push(`test_cases 覆盖维度严重不足 7 个（实际 ${covered.length}），缺失：${missing.join(', ')}`)
    } else if (covered.length < 9) {
      issues.push(`test_cases 覆盖维度不足 9 个（实际 ${covered.length}），缺失：${missing.join(', ')}`)
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

  // 歧义检测（Task 7.2，仅 warn 不阻塞入库）
  const ambiguityIssues = detectAmbiguity(p)
  for (const ai of ambiguityIssues) {
    issues.push(ai.message)
  }

  // 综合质量评分（Task 7.4）
  const qualityScoreBreakdown = calculateQualityScore(p)
  for (const note of qualityScoreBreakdown.notes) {
    issues.push(`[评分] ${note}`)
  }

  // 相似度检测（Task 7.8，仅在 options.existingProblems 传入时执行）
  let similarityScore = 0
  let similarityFailed = false
  if (options?.existingProblems && options.existingProblems.length > 0) {
    // Task 7.9：排除 PRE-generation 已注入的候选相似题，避免双重判罚
    const avoidTitles = new Set(
      (options.avoidDuplicateWith || [])
        .map(c => c.title)
        .filter(Boolean)
    )
    const filtered = options.existingProblems.filter(
      ep => ep && ep.title && !avoidTitles.has(ep.title)
    )
    const sim = checkProblemSimilarity(
      {
        title: p.title || '',
        description: p.description || '',
        tags: Array.isArray(p.tags) ? p.tags : [],
      },
      filtered
    )
    similarityScore = sim.maxSimilarity
    if (sim.maxSimilarity > SIMILARITY_FAILED_THRESHOLD) {
      similarityFailed = true
      issues.push(
        `新题与已有题「${sim.similarTo?.title || '?'}」相似度过高（` +
        `${(sim.maxSimilarity * 100).toFixed(1)}% > ${(SIMILARITY_FAILED_THRESHOLD * 100).toFixed(0)}%），视为重复题`
      )
    } else if (sim.maxSimilarity > SIMILARITY_WARN_THRESHOLD) {
      issues.push(
        `新题与已有题「${sim.similarTo?.title || '?'}」相似度较高（` +
        `${(sim.maxSimilarity * 100).toFixed(1)}%），建议人工复核`
      )
    }
  }

  // 评分阈值判定（Task 7.6）：>= 80 pass / 60-80 warn / < 60 FAILED
  let scoreFailed = false
  if (qualityScoreBreakdown.overall < QUALITY_SCORE_FAILED_THRESHOLD) {
    scoreFailed = true
    issues.push(`题目质量评分过低（${qualityScoreBreakdown.overall}/100 < ${QUALITY_SCORE_FAILED_THRESHOLD}），建议重试`)
  } else if (qualityScoreBreakdown.overall < QUALITY_SCORE_PASS_THRESHOLD) {
    issues.push(`题目质量评分偏低（${qualityScoreBreakdown.overall}/100），建议人工复核`)
  }

  // 最终 ok 判定：存在 error 级 issue（覆盖度 < 7 / 相似度 > 0.95 / 评分 < 60）则 FAILED
  const hasError = coverageError || similarityFailed || scoreFailed
  const ok = issues.length === 0 && !hasError

  if (ok) {
    return {
      ok: true,
      qualityScore: qualityScoreBreakdown.overall,
      similarityScore,
    }
  }

  // severity 判定：有 error → error；仅 warn → warn
  let severity: QualitySeverity = 'warn'
  if (hasError) {
    severity = 'error'
  }

  return {
    ok: false,
    reason: issues[0] || '质量自检未通过',
    severity,
    details: issues,
    qualityScore: qualityScoreBreakdown.overall,
    similarityScore,
  }
}

/**
 * 从数据库加载全部已入库题目并执行相似度检测（Task 7.8 / 7.9）
 *
 * 设计意图：
 * - checkGeneratedProblem 保持同步签名（避免破坏现有调用方），相似度检测所需的 DB 查询
 *   抽离到本异步函数；调用方先调用本函数拿到 existingProblems + maxSimilarity，
 *   再传入 checkGeneratedProblem(p, { avoidDuplicateWith, existingProblems }) 完成集成检测
 * - **重要**：Problem 模型无 isDeleted 字段，
 *   因此 prisma.problem.findMany 中**不要**加 `where: { isDeleted: false }`，否则 Prisma 会报错
 * - 查询全部题库（不限制时间范围），避免漏检老题
 * - 排除 PRE-generation 已注入的候选相似题（avoidDuplicateWith），避免双重判罚
 *
 * @param newProblem 新题（title / description / tags）
 * @param avoidDuplicateWith PRE-generation 注入的候选相似题（在结果中排除）
 * @returns 已入库题目列表（已排除候选相似题）+ 最大相似度 + 最相似题目信息
 */
export async function checkProblemSimilarityFromDb(
  newProblem: { title: string; description: string; tags: string[] },
  avoidDuplicateWith?: Array<{ title: string; tags: string[] }>
): Promise<{
  existingProblems: Array<{ title: string; description: string; tags: string[] }>;
  maxSimilarity: number;
  similarTo?: { title: string; similarity: number };
}> {
  // 注意：Problem 模型无 isDeleted 字段，不加 where 过滤
  const all = await prisma.problem.findMany({
    select: { id: true, title: true, description: true, tags: true },
  })

  let filtered: Array<{ title: string; description: string; tags: string[] }> = all.map(p => ({
    title: String(p.title || ''),
    description: String(p.description || ''),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
  }))

  // Task 7.9：排除 PRE-generation 已注入的候选相似题，避免双重判罚
  if (avoidDuplicateWith && avoidDuplicateWith.length > 0) {
    const avoidTitles = new Set(
      avoidDuplicateWith.map(c => c.title).filter(Boolean)
    )
    filtered = filtered.filter(p => !avoidTitles.has(p.title))
  }

  const sim = checkProblemSimilarity(newProblem, filtered)
  return {
    existingProblems: filtered,
    maxSimilarity: sim.maxSimilarity,
    similarTo: sim.similarTo,
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
  // 不设数量下限——覆盖度判定完全基于 input 中真实体现的数据特征，
  // AI 凑数量无法蒙混过关。只要覆盖维度达标，数量由 AI 根据覆盖需要自行决定。
  // 覆盖维度校验
  if (testCases.length >= 1) {
    const covered = inferCoveredDimensions(testCases)
    if (covered.length < 8) {
      const allDimensions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
      const missing = allDimensions.filter(id => !covered.find(c => c.id === id))
      issues.push(`testCases 覆盖维度不足 8 个（实际 ${covered.length}），缺失：${missing.join(', ')}；请在 input 中真正体现这些维度的数据特征，而非增加测试点数量`)
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
  // - 倒数边界（i）：+5（接近数据范围上限的次边界值）
  // 不再奖励"测试点数量"——避免 AI 凑数量刷分，覆盖度完全基于数据特征
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
  // 倒数边界：接近常见数据范围上限的值（替代原"数量充足"加分）
  if (hasNearUpperBound(allText)) {
    boundaryScore += 5
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
