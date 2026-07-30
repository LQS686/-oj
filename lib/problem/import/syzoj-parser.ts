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
import { ApiError } from '@/lib/api/errors'
import type { ImportedProblem, ImportedTestCase } from './types'

/**
 * 解析 SYZOJ / QDUOJ JSON 字符串
 */
export function parseSyzojJson(jsonText: string): ImportedProblem[] {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApiError('INVALID_SYZOJ_JSON', `JSON 解析失败: ${msg}`, 400)
  }

  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const items: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(root?.problems)
      ? (root.problems as unknown[])
      : Array.isArray(root?.items)
        ? (root.items as unknown[])
        : data != null
          ? [data]
          : []

  if (items.length === 0) {
    throw new ApiError('NO_SYZOJ_ITEMS', '未在 JSON 中找到题目数据', 400)
  }

  return items.map((raw: unknown, idx: number) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    // 样例：SYZOJ 经典字段 sample_input / sample_output
    const samples: ImportedProblem['samples'] = []
    if (item.sample_input !== undefined || item.sample_output !== undefined) {
      samples.push({
        input: String(item.sample_input ?? ''),
        output: String(item.sample_output ?? ''),
      })
    }
    // 部分新版 SYZOJ 用 samples 数组
    if (Array.isArray(item.samples)) {
      for (const s of item.samples) {
        const sample = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
        samples.push({
          input: String(sample.input ?? ''),
          output: String(sample.output ?? ''),
        })
      }
    }

    // 测试用例：兼容 test_cases / testCases / subtasks
    const rawTests =
      item.test_cases || item.testCases || item.tests || item.subtasks || []
    const testCases: ImportedTestCase[] = Array.isArray(rawTests)
      ? rawTests.map((t) => {
          const tc = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
          return {
            input: String(tc.input ?? ''),
            output: String(tc.output ?? ''),
            isSample: false,
            score: typeof tc.score === 'number' ? tc.score : undefined,
          }
        })
      : []

    return {
      title: String(item.title || `未命名题目 ${idx + 1}`),
      description: String(item.description || ''),
      input: String(item.input_format || item.input || ''),
      output: String(item.output_format || item.output || ''),
      samples,
      hint: item.hint ? String(item.hint) : undefined,
      source: item.source ? String(item.source) : 'SYZOJ',
      difficulty: item.difficulty ? String(item.difficulty) : '入门',
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      timeLimit: Number(item.time_limit || item.timeLimit) || 1000,
      memoryLimit: Number(item.memory_limit || item.memoryLimit) || 128,
      stdCode:
        typeof item.solution === 'string'
          ? item.solution
          : typeof item.std_code === 'string'
            ? item.std_code
            : undefined,
      stdLang: item.solution || item.std_code ? 'cpp' : undefined,
      testCases,
      externalId: String(item.id || `syzoj-${idx + 1}`),
    }
  })
}
