/**
 * lib/problem/import/csv-parser.ts
 * CSV 批量导入解析器
 *
 * 用于教师/管理员自编题目批量录入，支持 RFC 4180 引号包裹的多行字段。
 *
 * 表头字段（不区分大小写）：
 *   title*             题目标题（必填）
 *   description*       题目描述（必填）
 *   input              输入格式
 *   output             输出格式
 *   sample_input       样例输入（单样例）
 *   sample_output      样例输出
 *   hint               提示
 *   source             来源
 *   difficulty         难度（8 档之一，缺省由 service 兜底）
 *   tags               标签（逗号分隔，整行用引号包裹）
 *   timeLimit          时间限制 ms（默认 1000）
 *   memoryLimit        内存限制 MB（默认 128）
 *
 * 注：CSV 不支持测试用例导入，仅适合简单题面录入。
 *     需要完整测试用例的题目请用 FPS / Hydro 格式。
 */
import { ApiError } from '@/lib/api/withApi'
import type { ImportedProblem } from './types'

/** 字段名别名表（允许用户用中文表头） */
const HEADER_ALIASES: Record<string, string> = {
  '标题': 'title',
  '题目': 'title',
  'title': 'title',
  '描述': 'description',
  '题目描述': 'description',
  'description': 'description',
  '输入': 'input',
  '输入格式': 'input',
  'input': 'input',
  'input_format': 'input',
  '输出': 'output',
  '输出格式': 'output',
  'output': 'output',
  'output_format': 'output',
  '样例输入': 'sample_input',
  'sample_input': 'sample_input',
  'sampleinput': 'sample_input',
  '样例输出': 'sample_output',
  'sample_output': 'sample_output',
  'sampleoutput': 'sample_output',
  '提示': 'hint',
  'hint': 'hint',
  '来源': 'source',
  'source': 'source',
  '难度': 'difficulty',
  'difficulty': 'difficulty',
  '标签': 'tags',
  'tags': 'tags',
  'tag': 'tags',
  '时间限制': 'timeLimit',
  'timelimit': 'timeLimit',
  'time_limit': 'timeLimit',
  '内存限制': 'memoryLimit',
  'memorylimit': 'memoryLimit',
  'memory_limit': 'memoryLimit',
}

/**
 * RFC 4180 兼容的 CSV 解析器
 *
 * - 支持引号包裹的含逗号字段
 * - 支持引号包裹的多行字段（含 \n）
 * - 引号内双引号转义（""）
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  // 规范化换行
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (ch === '\n') {
        currentRow.push(currentField)
        currentField = ''
        rows.push(currentRow)
        currentRow = []
      } else {
        currentField += ch
      }
    }
  }
  // 收尾
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }
  return rows.filter(r => r.length > 0 && r.some(c => c.trim() !== ''))
}

/**
 * 解析 CSV 字符串为 ImportedProblem 数组
 */
export function parseCsvProblems(csvText: string): ImportedProblem[] {
  if (!csvText || !csvText.trim()) {
    throw new ApiError('INVALID_CSV', 'CSV 内容为空', 400)
  }

  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    throw new ApiError('INVALID_CSV', 'CSV 至少需要表头 + 1 行数据', 400)
  }

  // 解析表头
  const headerRow = rows[0].map(h => h.trim().toLowerCase())
  const fieldMap: string[] = [] // 列索引 → 标准字段名（'' 表示忽略）
  for (const h of headerRow) {
    fieldMap.push(HEADER_ALIASES[h] || '')
  }

  if (!fieldMap.includes('title')) {
    throw new ApiError(
      'INVALID_CSV_HEADER',
      'CSV 表头缺少 title 列（必填）',
      400
    )
  }

  const results: ImportedProblem[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const obj: Record<string, string> = {}
    // 每列第一次出现的值优先，重复列忽略（CSV 不支持同字段多列合并）
    for (let c = 0; c < row.length; c++) {
      const field = fieldMap[c]
      if (field && obj[field] === undefined) {
        obj[field] = row[c]
      }
    }

    // 解析 tags（允许逗号分隔）
    const tags = obj.tags
      ? obj.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : []

    // 时间/内存限制
    const timeLimit = parseInt(obj.timeLimit, 10)
    const memoryLimit = parseInt(obj.memoryLimit, 10)

    // 样例
    const samples: ImportedProblem['samples'] = []
    if (obj.sample_input !== undefined || obj.sample_output !== undefined) {
      samples.push({
        input: obj.sample_input || '',
        output: obj.sample_output || '',
      })
    }

    results.push({
      title: (obj.title || `未命名题目 ${r}`).trim(),
      description: (obj.description || '').trim(),
      input: obj.input || '',
      output: obj.output || '',
      samples,
      hint: obj.hint || undefined,
      source: obj.source || undefined,
      difficulty: obj.difficulty || '入门',
      tags,
      timeLimit: Number.isFinite(timeLimit) && timeLimit > 0 ? timeLimit : 1000,
      memoryLimit:
        Number.isFinite(memoryLimit) && memoryLimit > 0 ? memoryLimit : 128,
      testCases: [],
      externalId: `csv-row-${r}`,
    })
  }

  return results
}
