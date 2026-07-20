/**
 * lib/problem/import/hydro-parser.ts
 * Hydro OJ 题库包解析器
 *
 * Hydro 包格式（ZIP）典型结构（参考 https://hydro.ac）：
 *
 *   单题 ZIP：
 *     problem.yaml              - 题目元数据（YAML，含 title/tag 等）
 *     problem.md                - 题面正文（Hydro 导出为 HTML，本项目保留原样）
 *     testdata/                 - 测试数据目录（Hydro 标准目录）
 *       1.in / 1.out / 2.in / 2.out ...
 *       config.yaml             - 测试配置：time/memory/redirect 等覆盖
 *     samples/                  - 样例测试点（可选，部分老题目用此目录）
 *     tests/                    - 老版本完整测试点目录（可选）
 *     std.cpp                   - 标程
 *
 *   多题 ZIP（一个包打包多题）：
 *     1/
 *       problem.yaml
 *       problem.md
 *       testdata/...
 *     2/
 *       problem.yaml
 *       ...
 *     导入指南.txt                - Hydro 自动生成的说明文件
 *
 * 也支持 JSON 导入（单题 JSON 或多题数组）。
 *
 * 安全：使用项目已有的 isSafeZipEntryName 防 Zip Slip。
 */
import AdmZip from 'adm-zip'
import { ApiError } from '@/lib/api/withApi'
import { isSafeZipEntryName } from '../testcase'
import type { ImportedProblem, ImportedTestCase } from './types'

/* ============================================================================
 * 极简 YAML 解析器（仅支持 Hydro problem.yaml / config.yaml 使用的子集）
 * 支持：key: value、key: 'value'、列表 (- item)
 * 不支持：嵌套对象、多行字符串、anchors 等复杂语法
 * ========================================================================== */

interface ParsedYaml {
  [key: string]: string | string[] | number | null
}

function parseSimpleYaml(text: string): ParsedYaml {
  const result: ParsedYaml = {}
  const lines = text.split('\n')
  let currentListKey: string | null = null

  for (const rawLine of lines) {
    // 注释
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue

    // 列表项
    if (/^\s*-\s+/.test(line)) {
      if (currentListKey) {
        const value = line.replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, '')
        const existing = result[currentListKey]
        if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          result[currentListKey] = [value]
        }
      }
      continue
    }

    // key: value
    const m = line.match(/^([\w.]+)\s*:\s*(.*)$/)
    if (m) {
      const key = m[1]
      let value: string = m[2].trim()
      // 移除引号
      value = value.replace(/^['"]|['"]$/g, '')

      if (value === '') {
        // 可能是列表的起始
        currentListKey = key
        result[key] = []
      } else {
        currentListKey = null
        // 尝试数字转换
        const num = Number(value)
        if (value !== '' && !isNaN(num)) {
          result[key] = num
        } else {
          result[key] = value
        }
      }
    }
  }
  return result
}

/**
 * 解析 Hydro 时间/内存限制（YAML 中可能是 "1000" / "1s" / "256MB"）
 */
function parseHydroLimit(value: string | number | null | undefined, fallback: number, unit?: 'ms' | 'mb'): number {
  if (value === null || value === undefined) return fallback
  const s = String(value).trim().toLowerCase()
  if (!s) return fallback

  // 提取数字和单位
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|mb|kb|gb)?$/)
  if (!m) return fallback
  const n = parseFloat(m[1])
  const u = m[2]
  if (!Number.isFinite(n)) return fallback

  if (unit === 'ms') {
    // 时间
    if (u === 's') return Math.round(n * 1000)
    if (u === 'ms' || !u) return Math.round(n)
    return fallback
  } else {
    // 内存
    if (u === 'kb') return Math.max(1, Math.floor(n / 1024))
    if (u === 'gb') return Math.round(n * 1024)
    if (u === 'mb' || !u) return Math.round(n)
    return fallback
  }
}

/* ============================================================================
 * Hydro 标签清洗
 *   Hydro problem.yaml 的 tag 字段会混入非真正 tag 的元数据项，
 *   例如 'price::0'（ Hydro 内置的付费标记）、'隐藏'（隐藏题目标记）、
 *   '算法笔记 '（尾部空白）等。这里过滤掉这些噪声，只保留有意义的标签。
 * ========================================================================== */

/** Hydro 内置元数据 tag 前缀（应过滤掉） */
const HYDRO_META_TAG_PREFIXES = ['price::', 'difficulty::', 'rating::', 'time::', 'memory::']

function cleanHydroTags(rawTags: string | string[] | number | null | undefined): string[] {
  const arr: string[] = Array.isArray(rawTags)
    ? rawTags.map(String)
    : (rawTags !== null && rawTags !== undefined ? [String(rawTags)] : [])
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of arr) {
    const s = String(raw).trim()
    if (!s) continue
    // 过滤 Hydro 内置元数据标记
    if (HYDRO_META_TAG_PREFIXES.some(p => s.toLowerCase().startsWith(p))) continue
    // 过滤 Hydro 系统标记
    if (s === '隐藏' || s === 'hidden') continue
    // 去重（大小写不敏感）
    const lower = s.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(s)
  }
  return result
}

/* ============================================================================
 * HTML 题面智能拆分
 *
 * Hydro 导出的 problem.md 是 HTML 格式，结构通常为：
 *   <h2>说明</h2>          ... 描述段 ...
 *   <h2>输入格式</h2>      ... 输入说明段 ...
 *   <h2>输出格式</h2>      ... 输出说明段 ...
 *   <h2>样例</h2>          <pre><code class="language-input1">...</code></pre>
 *                          <pre><code class="language-output1">...</code></pre>
 *
 * 本项目 ProblemDescription 组件按 description/input/output/samples 分段展示，
 * 若把整个 HTML 都塞到 description 字段，会与组件的 section 标题重复显示。
 * 因此需要按 h2 标题把 HTML 切成多段，分别填入对应字段。
 *
 * 容错策略：
 *   - 若题面不是 HTML（纯 markdown 或无标题），不拆分，整个内容放入 description
 *   - 若缺少某段标题（如只有"说明"无"输入格式"），对应字段留空
 *   - 样例优先从 HTML 的 <pre><code> 提取；若 HTML 样例为空，回退到 testdata/ 前 2 个
 * ========================================================================== */

/** 题面段落标题的正则匹配模式（中英文都支持） */
const SECTION_PATTERNS = {
  description: /^<h[1-6]\s*>说明\s*<\/h[1-6]>/i,
  input: /^<h[1-6]\s*>输入格式\s*<\/h[1-6]>/i,
  output: /^<h[1-6]\s*>输出格式\s*<\/h[1-6]>/i,
  hint: /^<h[1-6]\s*>(提示|提示与说明|hint)\s*<\/h[1-6]>/i,
  sample: /^<h[1-6]\s*>(样例|样例输入|samples?)\s*<\/h[1-6]>/i,
}

/**
 * 把 HTML 题面按 h2/h3 标题切成多段
 * 返回 { description, input, output, hint, sampleHtml }
 *   - description/input/output/hint：对应段落的 HTML 内容（已 trim）
 *   - sampleHtml：样例段的原始 HTML，由调用方进一步解析 <pre><code>
 */
function splitHtmlProblem(
  html: string
): { description: string; input: string; output: string; hint: string; sampleHtml: string } {
  // 检测是否为含 h2 标题的 HTML（否则可能是纯 markdown，不拆分）
  const hasSectionTitles = /<h[1-6]\s*>[^<]*<\/h[1-6]>/i.test(html)
  if (!hasSectionTitles) {
    return { description: html, input: '', output: '', hint: '', sampleHtml: '' }
  }

  // 按 <h2>/<h3> 标签切分，保留标题作为段落标识
  // 正则匹配形如 <h2>标题</h2> 或 <h3>标题</h3>
  const parts = html.split(/(?=<h[1-6]\s*>[^<]*<\/h[1-6]>)/i)

  const result = {
    description: '',
    input: '',
    output: '',
    hint: '',
    sampleHtml: '',
  }

  // 第一段（在第一个 h2 之前的内容）作为 description 的一部分
  // 但通常 Hydro 题面第一段就是 <h2>说明</h2>，所以 parts[0] 可能是空串
  let pendingDescription = ''

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim()
    if (!part) continue

    // 匹配当前段落的标题
    const titleMatch = part.match(/^<h[1-6]\s*>([^<]*)<\/h[1-6]>([\s\S]*)$/i)
    if (!titleMatch) {
      // 没有标题的段落，归入 description（可能是题面前言）
      pendingDescription += part + '\n'
      continue
    }

    const title = titleMatch[1].trim()
    const body = titleMatch[2].trim()
    const lowerTitle = title.toLowerCase()

    if (SECTION_PATTERNS.description.test(part)) {
      result.description = body
    } else if (SECTION_PATTERNS.input.test(part)) {
      result.input = body
    } else if (SECTION_PATTERNS.output.test(part)) {
      result.output = body
    } else if (SECTION_PATTERNS.hint.test(part)) {
      result.hint = body
    } else if (SECTION_PATTERNS.sample.test(part)) {
      result.sampleHtml = body
    } else if (lowerTitle.includes('说明') || lowerTitle.includes('description')) {
      result.description = body
    } else if (lowerTitle.includes('输入') || lowerTitle.includes('input')) {
      result.input = body
    } else if (lowerTitle.includes('输出') || lowerTitle.includes('output')) {
      result.output = body
    } else if (lowerTitle.includes('提示') || lowerTitle.includes('hint')) {
      result.hint = body
    } else if (lowerTitle.includes('样例') || lowerTitle.includes('sample')) {
      result.sampleHtml = body
    } else {
      // 未识别的标题，合并到 description
      result.description += (result.description ? '\n' : '') + part
    }
  }

  // 处理 pendingDescription（在第一个 h2 之前的内容）
  if (pendingDescription.trim() && !result.description) {
    result.description = pendingDescription.trim()
  }

  return result
}

/**
 * 从 HTML 样例段提取样例对
 *
 * Hydro 格式：
 *   <pre><code class="language-input1">输入内容</code></pre>
 *   <pre><code class="language-output1">输出内容</code></pre>
 *
 * 也兼容：
 *   <pre>输入</pre><pre>输出</pre>
 *   样例输入：xxx 样例输出：yyy
 */
function extractSamplesFromHtml(
  sampleHtml: string
): Array<{ input: string; output: string; explanation?: string }> {
  if (!sampleHtml) return []

  const samples: Array<{ input: string; output: string; explanation?: string }> = []

  // 模式1：Hydro 标准格式 <pre><code class="language-inputN">...</code></pre>
  // 匹配所有 input/output 编号
  const inputMap = new Map<number, string>()
  const outputMap = new Map<number, string>()

  const inputRe = /<pre[^>]*>\s*<code[^>]*class\s*=\s*["'][^"']*language-input(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi
  const outputRe = /<pre[^>]*>\s*<code[^>]*class\s*=\s*["'][^"']*language-output(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi

  let m: RegExpExecArray | null
  while ((m = inputRe.exec(sampleHtml)) !== null) {
    const num = parseInt(m[1], 10)
    // HTML 实体解码（&lt; → <, &gt; → >, &amp; → &, &quot; → ", &#39; → '）
    const content = decodeHtmlEntities(m[2])
    inputMap.set(num, content)
  }
  while ((m = outputRe.exec(sampleHtml)) !== null) {
    const num = parseInt(m[1], 10)
    const content = decodeHtmlEntities(m[2])
    outputMap.set(num, content)
  }

  // 按编号配对
  const allNums = new Set<number>([...inputMap.keys(), ...outputMap.keys()])
  const sortedNums = Array.from(allNums).sort((a, b) => a - b)
  for (const num of sortedNums) {
    const input = inputMap.get(num) ?? ''
    const output = outputMap.get(num) ?? ''
    // 样例输入和输出都为空时跳过（Hydro 老题目常见：样例字段为空，实际数据在 testdata/）
    if (!input && !output) continue
    samples.push({ input, output })
  }

  // 模式2：成对 <pre>...</pre> 标签（无 language-inputN class）
  if (samples.length === 0) {
    const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi
    const preContents: string[] = []
    while ((m = preRe.exec(sampleHtml)) !== null) {
      // 提取 <pre> 内的纯文本（去除嵌套 <code> 标签）
      const inner = m[1].replace(/<code[^>]*>/gi, '').replace(/<\/code>/gi, '')
      preContents.push(decodeHtmlEntities(inner).trim())
    }
    // 按 input/output 成对配对
    for (let i = 0; i + 1 < preContents.length; i += 2) {
      samples.push({
        input: preContents[i],
        output: preContents[i + 1],
      })
    }
  }

  return samples
}

/** HTML 实体解码（最小实现，覆盖 Hydro 题面常见实体） */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * 判断字符串是否以 HTML 标签开头（粗略判断，用于决定是否走 HTML 拆分逻辑）
 */
function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim()
  // 以 < 开始，且第一个 < 后跟字母（HTML 标签）
  return /^<[a-zA-Z]/.test(trimmed)
}

/** 读取 ZIP entry 文本内容 */
function readEntryText(entry: AdmZip.IZipEntry | null): string {
  if (!entry) return ''
  return entry.getData().toString('utf-8')
}

/**
 * 从 ZIP 中提取测试用例（.in/.out 配对）
 *
 * Hydro 标准目录是 testdata/，老版本也可能用 samples/（样例）或 tests/（完整测试点）。
 * 调用方传入多个候选目录，按优先级查找。
 */
function extractTestCasesFromZip(
  zip: AdmZip,
  folderCandidates: string[]
): ImportedTestCase[] {
  // 在 ZIP 中查找第一个存在的目录前缀
  const all = zip.getEntries()
  let folder = ''
  for (const candidate of folderCandidates) {
    const prefix = candidate.endsWith('/') ? candidate : candidate + '/'
    if (all.some(e => !e.isDirectory && e.entryName.startsWith(prefix))) {
      folder = prefix
      break
    }
  }
  if (!folder) return []

  const entries = all.filter(e => {
    if (e.isDirectory) return false
    if (!e.entryName.startsWith(folder)) return false
    const filename = e.entryName.slice(folder.length)
    // 防路径穿越：filename 不能含分隔符
    if (!isSafeZipEntryName(filename)) return false
    return true
  })

  const map = new Map<number, { input?: string; output?: string; inName?: string; outName?: string }>()
  for (const entry of entries) {
    const name = entry.entryName.split('/').pop() || ''
    // 跳过 config.yaml 等配置文件
    if (/\.ya?ml$/i.test(name)) continue
    // 提取数字编号：1.in / 1.out / sample1.in / test1.in
    const m = name.match(/(\d+)\.(in|out|ans)$/i)
    if (!m) continue
    const num = parseInt(m[1], 10)
    const type = m[2].toLowerCase() === 'out' || m[2].toLowerCase() === 'ans' ? 'output' : 'input'
    if (!map.has(num)) map.set(num, {})
    const tc = map.get(num)!
    if (type === 'input') {
      tc.input = entry.getData().toString('utf-8')
      tc.inName = name
    } else {
      tc.output = entry.getData().toString('utf-8')
      tc.outName = name
    }
  }

  const result: ImportedTestCase[] = []
  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b)
  for (const k of sortedKeys) {
    const tc = map.get(k)!
    if (tc.input !== undefined || tc.output !== undefined) {
      result.push({
        input: tc.input || '',
        output: tc.output || '',
        isSample: false,
      })
    }
  }
  return result
}

/**
 * 检测 ZIP 是否是多题包（含多个数字编号子目录，如 1/ 2/ 3/）
 *
 * Hydro 多题包结构：
 *   1/problem.yaml
 *   2/problem.yaml
 *   导入指南.txt
 */
function detectMultiProblemRoots(zip: AdmZip): string[] {
  const all = zip.getEntries()
  const roots = new Set<string>()
  // 匹配 "数字/problem.yaml" 或 "数字/problem.yml"
  for (const entry of all) {
    if (entry.isDirectory) continue
    const m = entry.entryName.match(/^(\d+)\/problem\.ya?ml$/i)
    if (m) {
      roots.add(m[1] + '/')
    }
  }
  return Array.from(roots).sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    return na - nb
  })
}

/**
 * 在指定根目录下查找 entry（保留原 entryName 前缀）
 * candidates 是相对根目录的文件名
 */
function findEntryUnderRoot(
  zip: AdmZip,
  root: string,
  candidates: string[]
): AdmZip.IZipEntry | null {
  const all = zip.getEntries()
  for (const c of candidates) {
    // 1) root + c（直接拼接）
    const path1 = root + c
    const e1 = zip.getEntry(path1)
    if (e1 && !e1.isDirectory) return e1
    // 2) endsWith 匹配（兼容大小写）
    const match = all.find(e =>
      !e.isDirectory &&
      e.entryName.toLowerCase() === path1.toLowerCase()
    )
    if (match) return match
  }
  return null
}

/**
 * 在指定根目录下查找测试数据目录（testdata/ 等）
 * 返回第一个包含 .in/.out 文件的目录前缀（含 root 前缀）
 */
function findTestdataFolderUnderRoot(zip: AdmZip, root: string): string {
  const all = zip.getEntries()
  // 候选目录：Hydro 标准是 testdata/，老版本可能用 samples/ 或 tests/
  const candidates = ['testdata', 'tests', 'samples']
  for (const c of candidates) {
    const prefix = root + c + '/'
    const hasTestFile = all.some(e =>
      !e.isDirectory &&
      e.entryName.startsWith(prefix) &&
      /\.(in|out|ans)$/i.test(e.entryName)
    )
    if (hasTestFile) return prefix
  }
  return ''
}

/**
 * 从 testdata/config.yaml 读取时间/内存限制
 * Hydro 标准：testdata/config.yaml 含 `time: 1s`、`memory: 32mb` 等覆盖字段
 */
function readTestdataConfig(
  zip: AdmZip,
  root: string
): { timeLimit?: number; memoryLimit?: number; comparisonMode?: 'default' | 'strict' | 'ignore-spaces' | 'real-number'; realPrecision?: number } {
  const all = zip.getEntries()
  const cfgCandidates = ['testdata/config.yaml', 'testdata/config.yml']
  for (const c of cfgCandidates) {
    const path = root + c
    const entry = all.find(e => !e.isDirectory && e.entryName === path)
    if (!entry) continue
    const text = entry.getData().toString('utf-8')
    const yaml = parseSimpleYaml(text)
    const result: { timeLimit?: number; memoryLimit?: number; comparisonMode?: 'default' | 'strict' | 'ignore-spaces' | 'real-number'; realPrecision?: number } = {}
    // 时间限制：time 字段（"1s" / "1000ms" / "1000"）
    if (yaml.time !== undefined && yaml.time !== null && !Array.isArray(yaml.time)) {
      result.timeLimit = parseHydroLimit(yaml.time, 1000, 'ms')
    }
    // 内存限制：memory 字段（"32mb" / "256mb"）
    if (yaml.memory !== undefined && yaml.memory !== null && !Array.isArray(yaml.memory)) {
      result.memoryLimit = parseHydroLimit(yaml.memory, 128, 'mb')
    }
    // 比较模式：checker 字段
    const checker = typeof yaml.checker === 'string' ? yaml.checker.toLowerCase() : ''
    if (checker === 'strict' || checker === 'line' || checker === 'ignore-spaces') {
      // Hydro 的 line/strict 对应本项目的 strict/ignore-spaces
      result.comparisonMode = checker === 'line' ? 'ignore-spaces' : 'strict'
    } else if (checker === 'float' || checker === 'real') {
      result.comparisonMode = 'real-number'
      // Hydro float checker 可能含 precision 字段
      if (typeof yaml.precision === 'number') {
        result.realPrecision = yaml.precision
      }
    }
    return result
  }
  return {}
}

/**
 * 解析单个题目录（root 为 "" 或 "1/" 等）
 *
 * 该函数被 parseHydroZip 调用，每个 root 对应 ZIP 内一道题。
 *
 * 题面处理流程：
 *   1. 若 problem.md 是 HTML 格式（含 <h2>说明</h2> 等段落标题），
 *      按段落标题拆分成 description/input/output/samples 四部分。
 *   2. 若 problem.md 是纯 markdown 或无标题 HTML，整个内容放入 description。
 *   3. 样例优先级：HTML 内 <pre><code class="language-inputN"> > testdata/ 前 2 个。
 *   4. 若拆分后 input/output 为空，但 description 中含"输入格式"/"输出格式"等
 *      文字，保留 description 不变（避免误拆）。
 */
function parseOneProblem(zip: AdmZip, root: string): ImportedProblem {
  // 1. 读取 problem.yaml（必备）
  const yamlEntry = findEntryUnderRoot(zip, root, ['problem.yaml', 'problem.yml'])
  const yamlText = readEntryText(yamlEntry)
  if (!yamlText) {
    throw new ApiError('NO_PROBLEM_YAML', `Hydro 包缺少 problem.yaml（root=${root || '根目录'}）`, 400)
  }
  const yaml = parseSimpleYaml(yamlText)

  // 2. 读取题面（Hydro 导出格式是 HTML，存于 problem.md）
  //    也兼容 markdown 命名：题目描述.md / description.md 等
  const rawDescription = readEntryText(
    findEntryUnderRoot(zip, root, ['题目描述.md', 'problem.md', 'description.md', '题目.md'])
  )
  const separateInput = readEntryText(
    findEntryUnderRoot(zip, root, ['输入格式.md', 'input.md', '输入.md'])
  )
  const separateOutput = readEntryText(
    findEntryUnderRoot(zip, root, ['输出格式.md', 'output.md', '输出.md'])
  )
  const separateHint = readEntryText(
    findEntryUnderRoot(zip, root, ['提示.md', 'hint.md', '提示与说明.md'])
  ) || undefined

  // 智能拆分：若题面是 HTML 且含段落标题，按 h2 拆分
  let description = rawDescription
  let input = separateInput
  let output = separateOutput
  let hint = separateHint
  let htmlSamples: Array<{ input: string; output: string; explanation?: string }> = []

  if (looksLikeHtml(rawDescription) && !separateInput && !separateOutput) {
    // 仅当没有单独的输入/输出文件时，才尝试 HTML 拆分
    // （否则说明题面已经是分文件存储，不需要拆分）
    const split = splitHtmlProblem(rawDescription)
    if (split.description || split.input || split.output) {
      description = split.description
      input = split.input
      output = split.output
      hint = split.hint || separateHint
      htmlSamples = extractSamplesFromHtml(split.sampleHtml)
    }
  }

  // 3. 标程
  const stdEntry = findEntryUnderRoot(zip, root, ['std.cpp', 'standard.cpp', 'spj.cpp'])
  const stdCode = stdEntry ? readEntryText(stdEntry) : undefined

  // 4. 时间/内存限制优先级：
  //    testdata/config.yaml > problem.yaml (time/memory) > problem.yaml (timeLimit/memoryLimit) > 默认
  const cfg = readTestdataConfig(zip, root)
  const rawTl = yaml.timeLimit ?? yaml.time_limit ?? yaml.time
  const rawMl = yaml.memoryLimit ?? yaml.memory_limit ?? yaml.memory
  const timeLimit = cfg.timeLimit ?? parseHydroLimit(
    Array.isArray(rawTl) ? null : rawTl,
    1000,
    'ms'
  )
  const memoryLimit = cfg.memoryLimit ?? parseHydroLimit(
    Array.isArray(rawMl) ? null : rawMl,
    128,
    'mb'
  )

  // 5. 测试用例
  //    Hydro 标准目录：testdata/（完整测试点，Hydro 官方导出走这个目录）
  //    老版本兼容：samples/（样例展示）+ tests/（完整测试点）
  const testdataFolder = findTestdataFolderUnderRoot(zip, root)
  let testCases: ImportedTestCase[] = []
  let samples: Array<{ input: string; output: string; explanation?: string }> = []

  if (testdataFolder) {
    // 提取该目录下的测试用例
    const folderName = testdataFolder.slice(root.length) // 去掉 root 前缀
    testCases = extractTestCasesFromZip(zip, [folderName])
    // 如果是 samples/ 目录，同时作为展示样例（前 5 个）
    if (folderName.startsWith('samples')) {
      samples = testCases.slice(0, 5).map(tc => ({
        input: tc.input,
        output: tc.output,
      }))
    }
  }

  // 样例优先级：HTML <pre><code> 提取的样例 > testdata/ 前 2 个
  // Hydro 实践：HTML 样例字段常为空，实际样例数据在 testdata/1.in 和 1.out
  if (htmlSamples.length > 0) {
    samples = htmlSamples
  } else if (samples.length === 0 && testCases.length > 0) {
    // 如果 testdata/ 已用作完整测试点，但没单独的 samples/ 目录，
    // 取 testdata 的前 2 个作为展示样例（Hydro 实践惯例）
    samples = testCases.slice(0, 2).map(tc => ({
      input: tc.input,
      output: tc.output,
    }))
  }

  // 6. 标签清洗（过滤 Hydro 元数据 tag）
  const rawTags = yaml.tag ?? yaml.tags
  const tags = cleanHydroTags(rawTags)

  // 7. 题目元信息
  const title = String(yaml.title || '未命名题目').trim()

  return {
    title,
    // Hydro 的 problem.md 是 HTML，由前端 MarkdownRenderer（rehype-raw）渲染
    description: description || `# ${title}\n\n（无描述）`,
    input,
    output,
    samples,
    hint,
    source: String(yaml.source || 'Hydro OJ'),
    difficulty: String(yaml.difficulty || '入门'),
    tags: ['Hydro', ...tags],
    timeLimit,
    memoryLimit,
    comparisonMode: cfg.comparisonMode,
    realPrecision: cfg.realPrecision,
    stdCode,
    stdLang: stdCode ? 'cpp' : undefined,
    testCases,
    externalId: String(yaml.id || yaml.title || `hydro-${root.replace('/', '') || 'single'}`),
  }
}

/**
 * 解析 Hydro ZIP 题库包
 *
 * 支持两种结构：
 *   1) 单题包：problem.yaml 在根目录
 *   2) 多题包：1/problem.yaml、2/problem.yaml 等子目录结构
 *
 * 多题包的典型来源是 Hydro 一键导出（一个 ZIP 含多题），
 * ZIP 根目录会有"导入指南.txt"说明文件。
 */
export function parseHydroZip(zipBuffer: Buffer): ImportedProblem[] {
  if (!zipBuffer || zipBuffer.length === 0) {
    throw new ApiError('INVALID_HYDRO_ZIP', 'Hydro ZIP 包内容为空', 400)
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuffer)
  } catch (e: any) {
    throw new ApiError('INVALID_HYDRO_ZIP', `ZIP 解压失败: ${e.message}`, 400)
  }

  // 安全校验：所有 entry 文件名防路径穿越
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const parts = entry.entryName.split('/')
    for (const p of parts) {
      if (p && !isSafeZipEntryName(p) && p !== '') {
        throw new ApiError(
          'UNSAFE_ZIP_ENTRY',
          `ZIP 内文件名不安全: ${entry.entryName}`,
          400
        )
      }
    }
  }

  // 检测多题包结构
  const roots = detectMultiProblemRoots(zip)

  if (roots.length > 0) {
    // 多题包：按子目录逐题解析
    const results: ImportedProblem[] = []
    for (const root of roots) {
      try {
        results.push(parseOneProblem(zip, root))
      } catch (err: any) {
        // 单题失败不阻断其他题，错误信息记入下一题的 externalId
        // （Hydro 多题包常见，部分题目损坏不应整体失败）
        // 但若 problem.yaml 完全缺失，跳过该题
        if (err instanceof ApiError && err.code === 'NO_PROBLEM_YAML') {
          // 跳过：无 problem.yaml 的子目录不是有效题目
          continue
        }
        throw err
      }
    }
    if (results.length === 0) {
      throw new ApiError('NO_PROBLEM_YAML', 'Hydro 多题包未找到任何有效的 problem.yaml', 400)
    }
    return results
  }

  // 单题包：根目录解析
  return [parseOneProblem(zip, '')]
}

/* ============================================================================
 * JSON 解析（兼容 Hydro 导出格式）
 * ========================================================================== */

/**
 * 解析 Hydro JSON 格式（单题或多题数组）
 */
export function parseHydroJson(jsonText: string): ImportedProblem[] {
  let data: any
  try {
    data = JSON.parse(jsonText)
  } catch (e: any) {
    throw new ApiError('INVALID_HYDRO_JSON', `JSON 解析失败: ${e.message}`, 400)
  }
  const items: any[] = Array.isArray(data) ? data : [data]
  return items.map((raw, idx) => ({
    title: String(raw.title || `未命名题目 ${idx + 1}`),
    description: String(raw.description || raw.content || ''),
    input: String(raw.input || ''),
    output: String(raw.output || ''),
    samples: Array.isArray(raw.samples)
      ? raw.samples.map((s: any) => ({
          input: String(s.input ?? ''),
          output: String(s.output ?? ''),
        }))
      : [],
    hint: raw.hint || undefined,
    source: raw.source || 'Hydro OJ',
    difficulty: raw.difficulty || '入门',
    tags: ['Hydro', ...cleanHydroTags(raw.tags as string | string[] | null | undefined)],
    timeLimit: Number(raw.timeLimit || raw.time_limit) || 1000,
    memoryLimit: Number(raw.memoryLimit || raw.memory_limit) || 128,
    stdCode: raw.stdCode || raw.std_code || undefined,
    stdLang: raw.stdCode || raw.std_code ? 'cpp' : undefined,
    testCases: Array.isArray(raw.testCases || raw.tests)
      ? (raw.testCases || raw.tests).map((t: any) => ({
          input: String(t.input ?? ''),
          output: String(t.output ?? ''),
          isSample: false,
        }))
      : [],
    externalId: String(raw.id || raw._id || `hydro-json-${idx + 1}`),
  }))
}
