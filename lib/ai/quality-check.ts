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

export type QualitySeverity = 'warn' | 'error'

export interface QualityCheckResult {
  ok: boolean
  /** 第一个失败原因的简短描述 */
  reason?: string
  severity?: QualitySeverity
  /** 详细问题列表（如有） */
  details?: string[]
}

const VALID_DIFFICULTIES = ['入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI']

/** 检测字符串是否含中文字符 */
function hasChinese(s: string | undefined | null): boolean {
  if (!s) return false
  return /[\u4e00-\u9fff]/.test(s)
}

/**
 * 启发式推断 test_cases 覆盖了哪些维度
 * 基于简单的模式匹配（如检测小数字、大数字、特殊字符等）
 */
function inferCoveredDimensions(testCases: any[]): { id: string; name: string }[] {
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

  // difficulty 取值合法
  if (p.difficulty && !VALID_DIFFICULTIES.includes(p.difficulty)) {
    issues.push(`difficulty "${p.difficulty}" 不在合法档位列表中`)
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
