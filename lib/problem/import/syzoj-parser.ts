/**
 * lib/problem/import/syzoj-parser.ts
 * SYZOJ / QDUOJ 题库导出格式解析器
 *
 * SYZOJ 标准导出 JSON 结构：
 * {
 *   "title": "...",
 *   "description": "...",
 *   "input_format": "...",
 *   "output_format": "...",
 *   "sample_input": "...",
 *   "sample_output": "...",
 *   "hint": "...",
 *   "time_limit": 1000,
 *   "memory_limit": 256,
 *   "subtasks": [{ "input": "...", "output": "...", "score": 10 }],
 *   "test_cases": [{ "input": "...", "output": "..." }],
 *   "tags": [...],
 *   "difficulty": "..."
 * }
 *
 * 多题导出是 JSON 数组（或 { problems: [...] } 包装）。
 */
import { ApiError } from '@/lib/api/withApi'
import type { ImportedProblem, ImportedTestCase } from './types'

/**
 * 解析 SYZOJ / QDUOJ JSON 字符串
 */
export function parseSyzojJson(jsonText: string): ImportedProblem[] {
  let data: any
  try {
    data = JSON.parse(jsonText)
  } catch (e: any) {
    throw new ApiError('INVALID_SYZOJ_JSON', `JSON 解析失败: ${e.message}`, 400)
  }

  const items: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.problems)
      ? data.problems
      : Array.isArray(data?.items)
        ? data.items
        : [data]

  if (items.length === 0) {
    throw new ApiError('NO_SYZOJ_ITEMS', '未在 JSON 中找到题目数据', 400)
  }

  return items.map((raw: any, idx: number) => {
    // 样例：SYZOJ 经典字段 sample_input / sample_output
    const samples: ImportedProblem['samples'] = []
    if (raw.sample_input !== undefined || raw.sample_output !== undefined) {
      samples.push({
        input: String(raw.sample_input ?? ''),
        output: String(raw.sample_output ?? ''),
      })
    }
    // 部分新版 SYZOJ 用 samples 数组
    if (Array.isArray(raw.samples)) {
      for (const s of raw.samples) {
        samples.push({
          input: String(s.input ?? ''),
          output: String(s.output ?? ''),
        })
      }
    }

    // 测试用例：兼容 test_cases / testCases / subtasks
    const rawTests =
      raw.test_cases || raw.testCases || raw.tests || raw.subtasks || []
    const testCases: ImportedTestCase[] = Array.isArray(rawTests)
      ? rawTests.map((t: any) => ({
          input: String(t.input ?? ''),
          output: String(t.output ?? ''),
          isSample: false,
          score: typeof t.score === 'number' ? t.score : undefined,
        }))
      : []

    return {
      title: String(raw.title || `未命名题目 ${idx + 1}`),
      description: String(raw.description || ''),
      input: String(raw.input_format || raw.input || ''),
      output: String(raw.output_format || raw.output || ''),
      samples,
      hint: raw.hint || undefined,
      source: raw.source || 'SYZOJ',
      difficulty: raw.difficulty || '入门',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      timeLimit: Number(raw.time_limit || raw.timeLimit) || 1000,
      memoryLimit: Number(raw.memory_limit || raw.memoryLimit) || 128,
      stdCode: raw.solution || raw.std_code || undefined,
      stdLang: raw.solution || raw.std_code ? 'cpp' : undefined,
      testCases,
      externalId: String(raw.id || `syzoj-${idx + 1}`),
    }
  })
}
