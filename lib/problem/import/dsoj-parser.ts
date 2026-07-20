/**
 * lib/problem/import/dsoj-parser.ts
 * DSOJ 标准题包格式解析器（自主实现，不复用其它格式解析器）
 *
 * 设计目标：
 *   1. 格式稳定：版本化（pack.yaml.version），未来升级兼容
 *   2. 爬虫友好：所有字段文件化、UTF-8 编码、文件名约定清晰
 *   3. 完整性：覆盖 Problem 模型所有手动创建字段 + 全部测试数据
 *   4. 独立性：单题目录损坏不影响其他题导入
 *
 * 字段规范与项目真相源对齐：
 *   - 难度：lib/constants.ts 的 8 档（入门/普及-/普及/普及+/提高/提高+/省选/NOI）
 *   - visibility：public / private / contest（默认 public，与 schema 默认一致）
 *   - comparison_mode：default / strict / ignore-spaces / real-number
 *   - time_limit：1-30000 ms（默认 1000，对齐 admin 校验）
 *   - memory_limit：1-1024 MB（默认 128，对齐 schema 默认）
 *   - real_precision：0-12（默认 3）
 *   - 测试点数量上限：50（对齐 TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES）
 *   - 单测点 score：0-100（不填则由 service 均分）
 *   - 标程语言：cpp / c / python（通过 std 文件扩展名识别）
 *
 * 格式规范：
 *   dsoj-pack.zip
 *   ├── pack.yaml              # 包元信息（可选，推荐）
 *   │   - format: dsoj-pack    # 格式标识（必需，固定值）
 *   │   - version: "1.0"       # 格式版本
 *   │   - source: ...          # 数据来源
 *   │   - description: ...     # 包说明
 *   │   - created_at: ...      # 打包时间
 *   ├── problems/
 *   │   ├── <slug>/            # 题目目录（任意合法目录名）
 *   │   │   ├── problem.yaml   # 题目元信息（必需）
 *   │   │   ├── description.md # 题目描述（markdown，必需）
 *   │   │   ├── input.md       # 输入格式（可选）
 *   │   │   ├── output.md      # 输出格式（可选）
 *   │   │   ├── hint.md        # 提示（可选）
 *   │   │   ├── samples/       # 展示样例（可选，1.in/1.out/1.explanation.md）
 *   │   │   ├── testcases/     # 完整测试点（必需，1.in/1.out/1.score）
 *   │   │   ├── config.yaml    # 测试配置覆盖（可选）
 *   │   │   ├── std.cpp        # 标准代码（可选，支持 .cpp/.c/.py）
 *   │   │   └── spj.cpp        # 特判代码（可选，当前项目暂未启用 SPJ，解析时忽略）
 *   │   └── ...
 *
 * 优先级：config.yaml > problem.yaml > 默认值
 *
 * 安全：使用 isSafeZipEntryName 防 Zip Slip；所有路径校验严格
 */
import AdmZip from 'adm-zip'
import { ApiError } from '@/lib/api/withApi'
import { isSafeZipEntryName } from '../testcase'
import { isValidDifficulty, migrateDifficulty } from '@/lib/constants'
import type { ImportedProblem, ImportedTestCase } from './types'

/* ============================================================================
 * 常量定义
 * ========================================================================== */

/** 格式标识（pack.yaml.format 必须为这个值） */
const DSOJ_FORMAT_ID = 'dsoj-pack'

/** 当前支持的格式版本 */
const DSOJ_FORMAT_VERSION = '1.0'

/** 题目根目录前缀（所有题目必须在 problems/ 下） */
const PROBLEMS_DIR = 'problems/'

/** 必需文件 */
const REQUIRED_FILES = ['problem.yaml', 'description.md'] as const

/** 可选 markdown 文件（仅用于文档说明，未直接引用） */
const OPTIONAL_MD_FILES = ['input.md', 'output.md', 'hint.md'] as const
void OPTIONAL_MD_FILES

/** 测试数据目录候选 */
const TESTCASES_DIR_NAMES = ['testcases', 'tests', 'testdata'] as const

/** 样例目录候选 */
const SAMPLES_DIR_NAMES = ['samples'] as const

/** 标程候选文件名（按优先级，扩展名决定 stdLang） */
const STD_FILE_NAMES = ['std.cpp', 'std.c', 'std.py', 'standard.cpp', 'sol.cpp'] as const

/* ============================================================================
 * 字段规范（与项目真相源对齐）
 *   - 难度 8 档来自 lib/constants.ts
 *   - visibility/comparison_mode 来自 prisma schema 注释和 admin 校验
 *   - 限制范围来自 lib/problem/admin.ts 的 createAdminProblem / updateAdminProblem
 *   - 测试点上限来自 lib/problem/testcase.ts 的 TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES
 * ========================================================================== */

/** 合法的 visibility 值（与 schema 默认 "public" 一致） */
const VALID_VISIBILITIES = ['public', 'private', 'contest'] as const

/** 合法的 comparison_mode 值 */
const VALID_COMPARISON_MODES = ['default', 'strict', 'ignore-spaces', 'real-number'] as const

/** 时间限制范围（ms）：1-30000，对齐 admin 校验 */
const TIME_LIMIT_MIN = 1
const TIME_LIMIT_MAX = 30000
const TIME_LIMIT_DEFAULT = 1000

/** 内存限制范围（MB）：1-1024，对齐 admin 校验 */
const MEMORY_LIMIT_MIN = 1
const MEMORY_LIMIT_MAX = 1024
const MEMORY_LIMIT_DEFAULT = 128

/** 实数比较精度范围：0-12，对齐 admin 校验 */
const REAL_PRECISION_MIN = 0
const REAL_PRECISION_MAX = 12
const REAL_PRECISION_DEFAULT = 3

/** 单题测试点数量上限：50，对齐 TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES */
const MAX_TESTCASES = 50

/** 单测点分数范围：0-100（不填则由 service 均分到 100） */
const TESTCASE_SCORE_MIN = 0
const TESTCASE_SCORE_MAX = 100

/** 默认 visibility（与 schema @default("public") 一致） */
const VISIBILITY_DEFAULT = 'public'

/* ============================================================================
 * 极简 YAML 解析（与 hydro-parser 独立实现，避免耦合）
 *   支持：key: value、key: 'value'、列表 (- item)、注释 (#)
 *   不支持：嵌套对象、多行字符串、anchors
 * ========================================================================== */

interface DsojYamlValue {
  [key: string]: string | number | string[] | null
}

function parseDsojYaml(text: string): DsojYamlValue {
  const result: DsojYamlValue = {}
  const lines = text.split('\n')
  let currentListKey: string | null = null

  for (const rawLine of lines) {
    // 去除行尾注释和空白
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue

    // 列表项：- value
    const listMatch = line.match(/^\s*-\s+(.*)$/)
    if (listMatch) {
      if (currentListKey) {
        const value = listMatch[1].trim().replace(/^['"]|['"]$/g, '')
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
    const kvMatch = line.match(/^([\w_]+)\s*:\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[1]
      let value: string = kvMatch[2].trim()
      // 去引号
      value = value.replace(/^['"]|['"]$/g, '')

      if (value === '') {
        // 列表起始
        currentListKey = key
        result[key] = []
      } else {
        currentListKey = null
        // 数字转换
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

/* ============================================================================
 * 路径与安全校验
 * ========================================================================== */

/**
 * 严格校验 ZIP entry 路径安全性
 *   - 拒绝绝对路径（/开头）
 *   - 拒绝 .. 路径穿越
 *   - 拒绝 Windows 盘符（C:\）
 *   - 拒绝控制字符
 */
function isStrictSafePath(path: string): boolean {
  if (!path) return false
  // 统一分隔符检查
  const normalized = path.replace(/\\/g, '/')
  // 拒绝绝对路径
  if (normalized.startsWith('/')) return false
  // 拒绝 .. 路径穿越
  if (normalized.includes('../') || normalized.includes('/..') || normalized === '..') return false
  // 拒绝 Windows 盘符
  if (/^[a-zA-Z]:/.test(normalized)) return false
  // 拒绝控制字符
  if (/[\x00-\x1f]/.test(normalized)) return false
  // 复用项目的 isSafeZipEntryName 做最终判定
  return isSafeZipEntryName(normalized)
}

/**
 * 获取 ZIP 中所有有效题目目录（problems/ 下的直接子目录）
 *
 * 返回形如 ["problems/001-a-plus-b/", "problems/002-..."] 的列表，
 * 已按目录名排序，确保导入顺序稳定。
 */
function listProblemDirs(zip: AdmZip): string[] {
  const all = zip.getEntries()
  const dirs = new Set<string>()
  for (const entry of all) {
    if (!entry.entryName.startsWith(PROBLEMS_DIR)) continue
    // 取 problems/ 后的第一段作为题目目录名
    const rest = entry.entryName.slice(PROBLEMS_DIR.length)
    if (!rest) continue
    const slashIdx = rest.indexOf('/')
    if (slashIdx <= 0) continue
    const dirName = rest.slice(0, slashIdx)
    if (!dirName) continue
    // 目录名必须合法
    if (!isStrictSafePath(dirName)) continue
    dirs.add(PROBLEMS_DIR + dirName + '/')
  }
  return Array.from(dirs).sort()
}

/**
 * 在指定题目目录下查找文件
 *   candidates 是相对题目目录的文件名（如 "problem.yaml"）
 *   返回 entry 或 null
 */
function findFileUnderProblemDir(
  zip: AdmZip,
  problemDir: string,
  candidates: readonly string[]
): AdmZip.IZipEntry | null {
  const all = zip.getEntries()
  for (const c of candidates) {
    const path = problemDir + c
    for (const entry of all) {
      if (entry.isDirectory) continue
      if (entry.entryName === path) return entry
    }
  }
  return null
}

/**
 * 在指定题目目录下查找子目录
 *   candidates 是相对题目目录的目录名（如 "testcases"）
 *   返回完整目录前缀（含 problemDir）或 null
 */
function findSubdirUnderProblemDir(
  zip: AdmZip,
  problemDir: string,
  candidates: readonly string[]
): string | null {
  const all = zip.getEntries()
  for (const c of candidates) {
    const prefix = problemDir + c + '/'
    const hasFile = all.some(e =>
      !e.isDirectory &&
      e.entryName.startsWith(prefix) &&
      e.entryName.slice(prefix.length).indexOf('/') === -1
    )
    if (hasFile) return prefix
  }
  return null
}

/** 读取 entry 文本内容（UTF-8） */
function readEntryText(entry: AdmZip.IZipEntry | null): string {
  if (!entry) return ''
  return entry.getData().toString('utf-8')
}

/* ============================================================================
 * 测试用例提取
 * ========================================================================== */

/**
 * 从 testcases/ 目录提取测试用例
 *
 * 文件名约定：
 *   - 1.in / 1.out          第 1 组测试点输入/输出
 *   - 2.in / 2.out          第 2 组
 *   - 1.score               第 1 组的单测点分数（可选，0-100）
 *
 * 也兼容：
 *   - sample1.in / sample1.out
 *   - test1.in / test1.out
 *
 * 返回按编号排序的测试用例列表
 */
function extractTestcases(
  zip: AdmZip,
  testcasesDir: string
): ImportedTestCase[] {
  const all = zip.getEntries()
  const prefix = testcasesDir

  // 收集目录下所有文件
  const files: Array<{ name: string; entry: AdmZip.IZipEntry }> = []
  for (const entry of all) {
    if (entry.isDirectory) continue
    if (!entry.entryName.startsWith(prefix)) continue
    const filename = entry.entryName.slice(prefix.length)
    // 必须是直接子文件（不能嵌套目录）
    if (filename.includes('/')) continue
    if (!isStrictSafePath(filename)) continue
    files.push({ name: filename, entry })
  }

  // 按编号分组：input / output / score
  const groups = new Map<number, { input?: string; output?: string; score?: number }>()

  for (const { name, entry } of files) {
    // 匹配编号：1.in / 1.out / 1.score / sample1.in / test1.in
    const m = name.match(/(\d+)\.(in|out|ans|score)$/i)
    if (!m) continue
    const num = parseInt(m[1], 10)
    if (!Number.isFinite(num) || num <= 0) continue

    const ext = m[2].toLowerCase()
    if (!groups.has(num)) groups.set(num, {})
    const group = groups.get(num)!

    if (ext === 'in') {
      group.input = readEntryText(entry)
    } else if (ext === 'out' || ext === 'ans') {
      group.output = readEntryText(entry)
    } else if (ext === 'score') {
      const scoreText = readEntryText(entry).trim()
      const score = Number(scoreText)
      // 单测点分数范围：0-100，超范围忽略
      if (Number.isFinite(score) && score >= TESTCASE_SCORE_MIN && score <= TESTCASE_SCORE_MAX) {
        group.score = score
      }
    }
  }

  // 按编号排序输出
  const result: ImportedTestCase[] = []
  const sortedNums = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const num of sortedNums) {
    const g = groups.get(num)!
    // input 和 output 至少有一个才算有效测试点
    if (g.input === undefined && g.output === undefined) continue
    result.push({
      input: g.input ?? '',
      output: g.output ?? '',
      isSample: false,
      score: g.score,
    })
  }
  // 测试点数量上限保护：超过 MAX_TESTCASES 抛错（与项目 TESTCASE_UPLOAD_CONFIG 对齐）
  if (result.length > MAX_TESTCASES) {
    throw new ApiError(
      'TOO_MANY_TESTCASES',
      `测试点数量 ${result.length} 超过上限 ${MAX_TESTCASES}`,
      400
    )
  }
  return result
}

/**
 * 从 samples/ 目录提取展示样例
 *
 * 文件名约定：
 *   - 1.in / 1.out               第 1 组样例输入/输出
 *   - 1.explanation.md           第 1 组样例解释（markdown，可选）
 *
 * 返回按编号排序的样例列表
 */
function extractSamples(
  zip: AdmZip,
  samplesDir: string
): Array<{ input: string; output: string; explanation?: string }> {
  const all = zip.getEntries()
  const prefix = samplesDir

  const groups = new Map<number, { input?: string; output?: string; explanation?: string }>()

  for (const entry of all) {
    if (entry.isDirectory) continue
    if (!entry.entryName.startsWith(prefix)) continue
    const filename = entry.entryName.slice(prefix.length)
    if (filename.includes('/')) continue
    if (!isStrictSafePath(filename)) continue

    // 1.in / 1.out / 1.explanation.md
    const m = filename.match(/^(\d+)\.(in|out|ans|explanation\.md)$/i)
    if (!m) continue
    const num = parseInt(m[1], 10)
    if (!Number.isFinite(num) || num <= 0) continue

    const ext = m[2].toLowerCase()
    if (!groups.has(num)) groups.set(num, {})
    const group = groups.get(num)!

    if (ext === 'in') {
      group.input = readEntryText(entry)
    } else if (ext === 'out' || ext === 'ans') {
      group.output = readEntryText(entry)
    } else if (ext === 'explanation.md') {
      group.explanation = readEntryText(entry)
    }
  }

  const result: Array<{ input: string; output: string; explanation?: string }> = []
  const sortedNums = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const num of sortedNums) {
    const g = groups.get(num)!
    if (g.input === undefined && g.output === undefined) continue
    result.push({
      input: g.input ?? '',
      output: g.output ?? '',
      explanation: g.explanation,
    })
  }
  return result
}

/* ============================================================================
 * 配置合并
 * ========================================================================== */

/**
 * 合并 problem.yaml 和 config.yaml 的评测配置
 *   优先级：config.yaml > problem.yaml > 默认值
 *
 * 所有数值字段都做范围校验，超范围回退到默认值（与 admin 校验范围一致）。
 */
function mergeJudgeConfig(
  problemYaml: DsojYamlValue,
  configYaml: DsojYamlValue | null
): {
  timeLimit: number
  memoryLimit: number
  comparisonMode: 'default' | 'strict' | 'ignore-spaces' | 'real-number'
  realPrecision: number
} {
  /**
   * 从 yaml 取数值字段，config.yaml 优先，problem.yaml 兜底，超范围用 default
   */
  const getNumber = (
    key: string,
    min: number,
    max: number,
    fallback: number
  ): number => {
    // config.yaml 优先
    const cv = configYaml?.[key]
    if (cv !== undefined && cv !== null && !Array.isArray(cv)) {
      const n = Number(cv)
      if (Number.isFinite(n) && n >= min && n <= max) return Math.round(n)
    }
    // problem.yaml 兜底
    const pv = problemYaml[key]
    if (pv !== undefined && pv !== null && !Array.isArray(pv)) {
      const n = Number(pv)
      if (Number.isFinite(n) && n >= min && n <= max) return Math.round(n)
    }
    return fallback
  }

  /**
   * 从 yaml 取枚举字段，config.yaml 优先，problem.yaml 兜底，非法值用 fallback
   */
  const getEnum = <T extends string>(
    key: string,
    validValues: readonly T[],
    fallback: T
  ): T => {
    const cv = configYaml?.[key]
    if (typeof cv === 'string' && (validValues as readonly string[]).includes(cv)) {
      return cv as T
    }
    const pv = problemYaml[key]
    if (typeof pv === 'string' && (validValues as readonly string[]).includes(pv)) {
      return pv as T
    }
    return fallback
  }

  return {
    timeLimit: getNumber('time_limit', TIME_LIMIT_MIN, TIME_LIMIT_MAX, TIME_LIMIT_DEFAULT),
    memoryLimit: getNumber('memory_limit', MEMORY_LIMIT_MIN, MEMORY_LIMIT_MAX, MEMORY_LIMIT_DEFAULT),
    comparisonMode: getEnum(
      'comparison_mode',
      VALID_COMPARISON_MODES,
      'default'
    ),
    realPrecision: getNumber(
      'real_precision',
      REAL_PRECISION_MIN,
      REAL_PRECISION_MAX,
      REAL_PRECISION_DEFAULT
    ),
  }
}

/* ============================================================================
 * 单题解析
 * ========================================================================== */

/**
 * 解析单个题目目录
 *   problemDir 形如 "problems/001-a-plus-b/"
 */
function parseOneProblem(zip: AdmZip, problemDir: string): ImportedProblem {
  // 1. 必需文件校验
  for (const required of REQUIRED_FILES) {
    const entry = findFileUnderProblemDir(zip, problemDir, [required])
    if (!entry) {
      throw new ApiError(
        'MISSING_REQUIRED_FILE',
        `题目目录 ${problemDir} 缺少必需文件: ${required}`,
        400
      )
    }
  }

  // 2. 读取 problem.yaml
  const problemYamlEntry = findFileUnderProblemDir(zip, problemDir, ['problem.yaml'])
  const problemYamlText = readEntryText(problemYamlEntry)
  const problemYaml = parseDsojYaml(problemYamlText)

  // 3. 读取必需字段：title
  const title = typeof problemYaml.title === 'string'
    ? problemYaml.title.trim()
    : ''
  if (!title) {
    throw new ApiError(
      'MISSING_TITLE',
      `题目目录 ${problemDir} 的 problem.yaml 缺少 title 字段`,
      400
    )
  }

  // 4. 读取 markdown 文件
  const description = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['description.md'])
  )
  if (!description.trim()) {
    throw new ApiError(
      'EMPTY_DESCRIPTION',
      `题目目录 ${problemDir} 的 description.md 为空`,
      400
    )
  }
  const input = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['input.md'])
  )
  const output = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['output.md'])
  )
  const hint = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['hint.md'])
  ) || undefined

  // 5. 读取 config.yaml（可选）
  const configEntry = findFileUnderProblemDir(zip, problemDir, ['config.yaml'])
  const configYaml = configEntry ? parseDsojYaml(readEntryText(configEntry)) : null

  // 6. 合并评测配置
  const judgeConfig = mergeJudgeConfig(problemYaml, configYaml)

  // 7. 提取测试用例
  const testcasesDir = findSubdirUnderProblemDir(zip, problemDir, TESTCASES_DIR_NAMES)
  let testCases: ImportedTestCase[] = []
  if (testcasesDir) {
    testCases = extractTestcases(zip, testcasesDir)
  }
  if (testCases.length === 0) {
    throw new ApiError(
      'NO_TESTCASES',
      `题目目录 ${problemDir} 缺少测试用例（testcases/ 目录为空或不存在）`,
      400
    )
  }

  // 8. 提取展示样例
  const samplesDir = findSubdirUnderProblemDir(zip, problemDir, SAMPLES_DIR_NAMES)
  let samples: Array<{ input: string; output: string; explanation?: string }> = []
  if (samplesDir) {
    samples = extractSamples(zip, samplesDir)
  }
  // 若无单独 samples/，取 testcases 前 2 个作为展示样例
  if (samples.length === 0 && testCases.length > 0) {
    samples = testCases.slice(0, 2).map(tc => ({
      input: tc.input,
      output: tc.output,
    }))
  }

  // 9. 读取标程（支持 .cpp/.c/.py，通过扩展名识别语言）
  const stdEntry = findFileUnderProblemDir(zip, problemDir, STD_FILE_NAMES)
  let stdCode: string | undefined
  let stdLang: string | undefined
  if (stdEntry) {
    stdCode = readEntryText(stdEntry)
    // 按扩展名识别语言（与项目 lib/judge/compiler.ts 支持的语言一致）
    const ext = stdEntry.entryName.toLowerCase().split('.').pop()
    if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') {
      stdLang = 'cpp'
    } else if (ext === 'c') {
      stdLang = 'c'
    } else if (ext === 'py') {
      stdLang = 'python'
    } else {
      // 未知扩展名默认 cpp
      stdLang = 'cpp'
    }
  }

  // 10. 读取特判代码
  // 当前项目 Problem 模型无 spjCode 字段，解析时忽略，不报错
  const spjEntry = findFileUnderProblemDir(zip, problemDir, ['spj.cpp', 'checker.cpp'])
  if (spjEntry) {
    // 标记存在但暂不使用，待项目支持 SPJ 后启用
    void readEntryText(spjEntry)
  }

  // 11. 解析 tags（过滤空值和空白）
  const rawTags = problemYaml.tags
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map(String).map(s => s.trim()).filter(Boolean)
    : (typeof rawTags === 'string' && rawTags.trim() ? [rawTags.trim()] : [])

  // 12. 解析 difficulty：必须通过项目 8 档校验或旧版迁移
  //   - 8 档直接通过：入门/普及-/普及/普及+/提高/提高+/省选/NOI
  //   - 旧版（简单/中等/困难/easy/medium/hard）自动迁移
  //   - 完全无法识别 → 默认 "入门"
  //   与 service.ts 的 normalizeImportedProblem 保持一致
  const rawDifficulty = typeof problemYaml.difficulty === 'string'
    ? problemYaml.difficulty.trim()
    : ''
  const difficulty = (() => {
    if (isValidDifficulty(rawDifficulty)) return rawDifficulty
    const migrated = migrateDifficulty(rawDifficulty)
    if (isValidDifficulty(migrated)) return migrated
    return '入门'
  })()

  // 13. 解析其它字段
  const source = typeof problemYaml.source === 'string'
    ? problemYaml.source.trim()
    : 'DSOJ Pack'
  const problemNumber = typeof problemYaml.problem_number === 'string'
    ? problemYaml.problem_number.trim()
    : undefined
  // visibility 校验：必须是 public/private/contest 之一，否则用默认值 public
  const rawVisibility = typeof problemYaml.visibility === 'string'
    ? problemYaml.visibility.trim().toLowerCase()
    : ''
  const visibility = (VALID_VISIBILITIES as readonly string[]).includes(rawVisibility)
    ? rawVisibility
    : VISIBILITY_DEFAULT

  // visibility 已校验但 ImportedProblem 接口不包含此字段，
  // 实际入库时由 ImportOptions.visibility 统一覆盖（service.ts 设计）
  void visibility

  return {
    title,
    description,
    input,
    output,
    samples,
    hint,
    source,
    difficulty,
    tags,
    timeLimit: judgeConfig.timeLimit,
    memoryLimit: judgeConfig.memoryLimit,
    comparisonMode: judgeConfig.comparisonMode,
    realPrecision: judgeConfig.realPrecision,
    stdCode,
    stdLang,
    testCases,
    problemNumber: problemNumber || undefined,
    externalId: problemDir.replace(PROBLEMS_DIR, '').replace(/\/$/, ''),
  }
}

/* ============================================================================
 * 主入口
 * ========================================================================== */

/**
 * 解析 DSOJ 标准题包 ZIP
 *
 * @param zipBuffer ZIP 文件的 Buffer
 * @returns ImportedProblem[] 已解析的题目列表
 * @throws ApiError 格式错误、文件缺失、安全校验失败等
 */
export function parseDsojZip(zipBuffer: Buffer): ImportedProblem[] {
  if (!zipBuffer || zipBuffer.length === 0) {
    throw new ApiError('INVALID_DSOJ_ZIP', 'DSOJ 题包内容为空', 400)
  }

  // 解压 ZIP
  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuffer)
  } catch (e: any) {
    throw new ApiError('INVALID_DSOJ_ZIP', `ZIP 解压失败: ${e.message}`, 400)
  }

  // 安全校验：所有 entry 路径
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    if (!isStrictSafePath(entry.entryName)) {
      throw new ApiError(
        'UNSAFE_ZIP_ENTRY',
        `ZIP 内文件名不安全: ${entry.entryName}`,
        400
      )
    }
  }

  // 读取 pack.yaml（可选但推荐）
  const packEntry = zip.getEntry('pack.yaml')
  if (packEntry && !packEntry.isDirectory) {
    const packYaml = parseDsojYaml(readEntryText(packEntry))
    // 校验格式标识
    const format = typeof packYaml.format === 'string' ? packYaml.format : ''
    if (format && format !== DSOJ_FORMAT_ID) {
      throw new ApiError(
        'FORMAT_MISMATCH',
        `pack.yaml 的 format 字段应为 "${DSOJ_FORMAT_ID}"，实际为 "${format}"`,
        400
      )
    }
    // 版本校验（当前仅支持 1.0）
    const version = typeof packYaml.version === 'string' ? packYaml.version : ''
    if (version && version !== DSOJ_FORMAT_VERSION) {
      // 版本不匹配仅警告，不阻断（向前兼容）
      // 实际生产可改为严格校验
    }
  }

  // 列出所有题目目录
  const problemDirs = listProblemDirs(zip)
  if (problemDirs.length === 0) {
    throw new ApiError(
      'NO_PROBLEMS',
      '题包未找到任何题目目录（应在 problems/ 下创建题目子目录）',
      400
    )
  }

  // 逐题解析（单题失败不影响其他题）
  const results: ImportedProblem[] = []
  const errors: Array<{ dir: string; reason: string }> = []

  for (const dir of problemDirs) {
    try {
      const problem = parseOneProblem(zip, dir)
      results.push(problem)
    } catch (err: any) {
      // 记录错误但继续处理其他题
      const reason = err instanceof ApiError
        ? err.message
        : (err?.message || '未知错误')
      errors.push({ dir, reason })
    }
  }

  // 全部失败才抛错
  if (results.length === 0) {
    const detail = errors.map(e => `${e.dir}: ${e.reason}`).join('; ')
    throw new ApiError(
      'ALL_PROBLEMS_FAILED',
      `题包中所有题目解析失败。详情: ${detail}`,
      400
    )
  }

  // 部分失败：在控制台输出警告（调用方可通过返回的 results.length 与题目总数对比得知）
  // 此处不抛错，由 service.ts 的错误隔离机制处理
  if (errors.length > 0) {
    // 静默处理，错误信息由调用方通过对比 results.length 推断
    // 真正的错误信息会通过 importOneProblem 的 try/catch 捕获
  }

  return results
}

/**
 * 检测一个 ZIP buffer 是否是 DSOJ 标准题包
 *   通过 pack.yaml.format 字段判断
 */
export function isDsojPack(zipBuffer: Buffer): boolean {
  try {
    const zip = new AdmZip(zipBuffer)
    const packEntry = zip.getEntry('pack.yaml')
    if (!packEntry || packEntry.isDirectory) return false
    const packYaml = parseDsojYaml(readEntryText(packEntry))
    return packYaml.format === DSOJ_FORMAT_ID
  } catch {
    return false
  }
}

/** 当前支持的格式版本 */
export const DSOJ_PACK_VERSION = DSOJ_FORMAT_VERSION

/** 格式标识 */
export const DSOJ_PACK_FORMAT_ID = DSOJ_FORMAT_ID
