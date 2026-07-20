/**
 * lib/problem/import/fps-parser.ts
 * Free Problem Set (FPS) 格式解析器
 *
 * FPS 是国内最通用的 OJ 题库交换格式（zhblue/freeproblemset），
 * 支持 XML 和 JSON 两种导出形态，本解析器两者都支持。
 *
 * 格式参考：
 *   - XML: <fps version="1.2"><item>...</item></fps>
 *   - JSON: { "fps_version": "2", "items": [...] }
 *
 * 设计取舍：
 *   - 不引入第三方 XML 解析依赖，使用最小化 regex 解析（FPS 标签结构简单稳定）
 *   - 完整支持 CDATA section
 *   - 单题解析失败抛错由 service 层 try/catch 隔离
 */
import { ApiError } from '@/lib/api/withApi'
import type { ImportedProblem, ImportedTestCase } from './types'

/* ============================================================================
 * 通用工具
 * ========================================================================== */

/**
 * 提取 XML 标签内容（支持 CDATA 与普通文本）
 *
 * 例：
 *   extractTag('<title><![CDATA[A+B]]></title>', 'title') => 'A+B'
 *   extractTag('<time_limit unit="s">1</time_limit>', 'time_limit') => '1'
 */
function extractTag(xml: string, tagName: string): string | null {
  // 允许标签带属性（如 <time_limit unit="s">）
  const openRegex = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i')
  const openMatch = xml.match(openRegex)
  if (!openMatch) return null
  const openEnd = openMatch.index! + openMatch[0].length
  const closeTag = `</${tagName}>`
  const closeIdx = xml.indexOf(closeTag, openEnd)
  if (closeIdx === -1) return null
  const inner = xml.slice(openEnd, closeIdx)

  // 优先提取 CDATA
  const cdataMatch = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdataMatch) return cdataMatch[1]

  // 否则去除所有子标签，只保留文本（如 <p>text</p> => text）
  return inner
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/**
 * 提取标签的属性值
 * 例：extractAttr('<time_limit unit="s">1</time_limit>', 'time_limit', 'unit') => 's'
 */
function extractAttr(xml: string, tagName: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tagName}\\s+[^>]*${attr}=["']([^"']+)["']`, 'i'))
  return m ? m[1] : null
}

/**
 * 提取多个同标签内容（用于 test_input/test_output 配对、tag 列表等）
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const results: string[] = []
  const openRegex = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = openRegex.exec(xml)) !== null) {
    const openEnd = m.index! + m[0].length
    const closeTag = `</${tagName}>`
    const closeIdx = xml.indexOf(closeTag, openEnd)
    if (closeIdx === -1) break
    const inner = xml.slice(openEnd, closeIdx)
    const cdataMatch = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
    if (cdataMatch) {
      results.push(cdataMatch[1])
    } else {
      results.push(
        inner
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()
      )
    }
    openRegex.lastIndex = closeIdx + closeTag.length
  }
  return results
}

/**
 * 解析时间限制：FPS 支持 unit="s" / unit="ms"
 */
function parseTimeLimit(xml: string): number {
  const value = extractTag(xml, 'time_limit')
  if (!value) return 1000
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 1000
  const unit = (extractAttr(xml, 'time_limit', 'unit') || 'ms').toLowerCase()
  return unit === 's' ? n * 1000 : n
}

/**
 * 解析内存限制：FPS 支持 unit="mb" / unit="kb"
 */
function parseMemoryLimit(xml: string): number {
  const value = extractTag(xml, 'memory_limit')
  if (!value) return 128
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 128
  const unit = (extractAttr(xml, 'memory_limit', 'unit') || 'mb').toLowerCase()
  if (unit === 'kb') return Math.max(1, Math.floor(n / 1024))
  if (unit === 'gb') return n * 1024
  return n
}

/**
 * 解析单个 FPS item XML 片段
 */
function parseFpsItem(itemXml: string, index: number): ImportedProblem {
  const title = extractTag(itemXml, 'title') || `未命名题目 ${index + 1}`
  const description = extractTag(itemXml, 'description') || ''
  const input = extractTag(itemXml, 'input') || ''
  const output = extractTag(itemXml, 'output') || ''
  const hint = extractTag(itemXml, 'hint') || undefined
  const source = extractTag(itemXml, 'source') || undefined

  // 样例：FPS 单样例用 sample_input/sample_output，多样例用 samples/sample
  const samples: ImportedProblem['samples'] = []
  const sampleIn = extractTag(itemXml, 'sample_input')
  const sampleOut = extractTag(itemXml, 'sample_output')
  if (sampleIn !== null || sampleOut !== null) {
    samples.push({ input: sampleIn || '', output: sampleOut || '' })
  }
  // 多样例：<samples><sample><input>...</input><output>...</output></sample></samples>
  const samplesBlock = extractTag(itemXml, 'samples') || ''
  if (samplesBlock) {
    const sampleBlocks = extractAllTags(samplesBlock, 'sample')
    for (const sb of sampleBlocks) {
      const sIn = extractTag(sb, 'input') || ''
      const sOut = extractTag(sb, 'output') || ''
      const sExp = extractTag(sb, 'explanation') || undefined
      samples.push({ input: sIn, output: sOut, explanation: sExp })
    }
  }

  // 完整测试用例：test_input/test_output 配对
  const testInputs = extractAllTags(itemXml, 'test_input')
  const testOutputs = extractAllTags(itemXml, 'test_output')
  const testCases: ImportedTestCase[] = []
  const testCount = Math.min(testInputs.length, testOutputs.length)
  for (let i = 0; i < testCount; i++) {
    testCases.push({
      input: testInputs[i],
      output: testOutputs[i],
      isSample: false,
    })
  }

  // 测试用例块：<test_cases><case><input>...</input><output>...</output></case></test_cases>
  const testCasesBlock = extractTag(itemXml, 'test_cases') || ''
  if (testCasesBlock) {
    const caseBlocks = extractAllTags(testCasesBlock, 'case')
    for (const cb of caseBlocks) {
      const cIn = extractTag(cb, 'input') || ''
      const cOut = extractTag(cb, 'output') || ''
      if (cIn || cOut) {
        testCases.push({ input: cIn, output: cOut, isSample: false })
      }
    }
  }

  // 标签：<tags><tag>...</tag></tags>
  const tagsBlock = extractTag(itemXml, 'tags') || ''
  const tags = tagsBlock ? extractAllTags(tagsBlock, 'tag') : []

  // 标程：<solution language="C++">...</solution>
  const solution = extractTag(itemXml, 'solution')
  const solutionLang = extractAttr(itemXml, 'solution', 'language')

  return {
    title,
    description,
    input,
    output,
    samples,
    hint,
    source,
    difficulty: '入门', // FPS 标准无难度字段，由 service 层用 defaultDifficulty 兜底
    tags,
    timeLimit: parseTimeLimit(itemXml),
    memoryLimit: parseMemoryLimit(itemXml),
    stdCode: solution || undefined,
    stdLang: solutionLang?.toLowerCase().includes('python')
      ? 'python'
      : 'cpp',
    testCases,
    externalId: extractTag(itemXml, 'url') || `fps-${index + 1}`,
  }
}

/* ============================================================================
 * XML 解析入口
 * ========================================================================== */

/**
 * 解析 FPS XML 字符串
 *
 * 容错策略：
 *   - 自动检测 <fps ...> 或 <item> 根节点
 *   - 提取所有 <item>...</item> 块
 */
export function parseFpsXml(xml: string): ImportedProblem[] {
  if (!xml || typeof xml !== 'string') {
    throw new ApiError('INVALID_FPS_XML', 'FPS XML 内容为空', 400)
  }
  // 简单 BOM 与首行声明清理
  const cleaned = xml.replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*\?>/, '').trim()
  if (!cleaned.startsWith('<')) {
    throw new ApiError('INVALID_FPS_XML', '内容不是合法的 XML', 400)
  }

  // 提取所有 <item>...</item> 块（忽略嵌套 item）
  const items: string[] = []
  const openTag = '<item>'
  const openTagWithAttr = /<item\s[^>]*>/
  let cursor = 0
  while (cursor < cleaned.length) {
    let openIdx = cleaned.indexOf(openTag, cursor)
    let usedOpenTag = openTag
    if (openIdx === -1) {
      const m = openTagWithAttr.exec(cleaned.slice(cursor))
      if (!m) break
      openIdx = cursor + m.index
      usedOpenTag = m[0]
    }
    const openEnd = openIdx + usedOpenTag.length
    const closeIdx = cleaned.indexOf('</item>', openEnd)
    if (closeIdx === -1) break
    items.push(cleaned.slice(openIdx, closeIdx + '</item>'.length))
    cursor = closeIdx + '</item>'.length
  }

  if (items.length === 0) {
    throw new ApiError('NO_FPS_ITEMS', '未在 XML 中找到 <item> 题目', 400)
  }

  return items.map((itemXml, idx) => parseFpsItem(itemXml, idx))
}

/* ============================================================================
 * JSON 解析入口
 * ========================================================================== */

/**
 * 解析 FPS JSON 字符串
 *
 * 支持两种 JSON 结构：
 *   1. { fps_version, items: [...] }
 *   2. [...] （直接是数组）
 */
export function parseFpsJson(jsonText: string): ImportedProblem[] {
  let data: any
  try {
    data = JSON.parse(jsonText)
  } catch (e: any) {
    throw new ApiError('INVALID_FPS_JSON', `JSON 解析失败: ${e.message}`, 400)
  }

  const items: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.problems)
        ? data.problems
        : []

  if (items.length === 0) {
    throw new ApiError('NO_FPS_ITEMS', 'FPS JSON 中未找到题目数组', 400)
  }

  return items.map((raw: any, idx: number) => {
    // 测试用例：兼容 test_cases / testCases / tests
    const rawTests = raw.test_cases || raw.testCases || raw.tests || []
    const testCases: ImportedTestCase[] = Array.isArray(rawTests)
      ? rawTests.map((t: any) => ({
          input: String(t.input ?? ''),
          output: String(t.output ?? ''),
          isSample: false,
          score: typeof t.score === 'number' ? t.score : undefined,
        }))
      : []

    // 样例：兼容 samples / sample_input
    let samples: ImportedProblem['samples'] = []
    if (Array.isArray(raw.samples)) {
      samples = raw.samples.map((s: any) => ({
        input: String(s.input ?? ''),
        output: String(s.output ?? ''),
        explanation: s.explanation || s.note || undefined,
      }))
    } else if (raw.sample_input !== undefined || raw.sample_output !== undefined) {
      samples.push({
        input: String(raw.sample_input ?? ''),
        output: String(raw.sample_output ?? ''),
      })
    }

    // 时间/内存限制：FPS JSON 可能是 {unit, value} 或纯数字
    const tl = raw.time_limit || raw.timeLimit
    const ml = raw.memory_limit || raw.memoryLimit
    const timeLimit =
      typeof tl === 'object' && tl
        ? tl.unit === 's'
          ? tl.value * 1000
          : tl.value
        : typeof tl === 'number'
          ? tl
          : 1000
    const memoryLimit =
      typeof ml === 'object' && ml
        ? ml.unit === 'kb'
          ? Math.max(1, Math.floor(ml.value / 1024))
          : ml.value
        : typeof ml === 'number'
          ? ml
          : 128

    return {
      title: String(raw.title || `未命名题目 ${idx + 1}`),
      description: String(raw.description || ''),
      input: String(raw.input || raw.input_format || ''),
      output: String(raw.output || raw.output_format || ''),
      samples,
      hint: raw.hint || undefined,
      source: raw.source || undefined,
      difficulty: raw.difficulty || '入门',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      timeLimit,
      memoryLimit,
      stdCode: raw.solution || raw.std_code || undefined,
      stdLang: raw.solution_language || raw.std_lang || (raw.solution ? 'cpp' : undefined),
      testCases,
      externalId: raw.id || raw.url || `fps-json-${idx + 1}`,
    }
  })
}

/**
 * 自动识别 FPS 文件格式并解析
 * - 文件以 < 开头：XML
 * - 文件以 { 或 [ 开头：JSON
 */
export function parseFps(content: string): ImportedProblem[] {
  const trimmed = content.replace(/^\uFEFF/, '').trim()
  if (trimmed.startsWith('<')) return parseFpsXml(trimmed)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseFpsJson(trimmed)
  throw new ApiError(
    'INVALID_FPS_FORMAT',
    '无法识别的 FPS 文件格式（既不是 XML 也不是 JSON）',
    400
  )
}
