/**
 * lib/problem/import/dsoj-parser.ts
 * DSOJ 标准题包格式解析器（自主实现，不复用其它格式解析器）
 *
 * 提供两种解析入口：
 *   - parseDsojArchive：兼容入口，部分题目失败静默跳过，全部失败抛 ALL_PROBLEMS_FAILED
 *   - parseDsojArchiveDetailed：详细入口，按原始顺序返回每题成功/失败结果（供流式导入使用）
 *
 * 设计目标：
 *   1. 格式稳定：版本化（pack.yaml.version），兼容 v1.0 / v2.0
 *   2. 爬虫友好：所有字段文件化、UTF-8 编码、文件名约定清晰
 *   3. 完整性：覆盖 Problem 模型所有手动创建字段 + 全部测试数据
 *   4. 独立性：单题目录损坏不影响其他题导入
 *
 * v2 相对 v1 的核心变化：
 *   - 题目目录改为稳定 PID 命名（如 LP1001/），不再依赖 0001-LP1001-标题/
 *   - 包根增加权威 index.json（导入优先按 order 读取）
 *   - pack.yaml.version = "2.0"，可声明 index 文件名
 *   - 可选采集题解 solutions/；忽略 AI 过程产物（generator.py / quality.json / _runnable/）
 *
 * 格式规范：
 *   dsoj-pack.zip（推荐扁平；也兼容单层 dsoj-pack/ 包裹）
 *   ├── pack.yaml
 *   ├── index.json              # v2 权威题目列表（推荐）
 *   ├── problems/
 *   │   ├── <pid>/              # 如 LP1001
 *   │   │   ├── problem.yaml
 *   │   │   ├── description.md
 *   │   │   ├── background.md / input.md / output.md / hint.md
 *   │   │   ├── samples/
 *   │   │   ├── testcases/
 *   │   │   ├── solutions/      # 可选
 *   │   │   ├── config.yaml / std.cpp / checker.cpp
 *   │   │   └── …
 *
 * Special Judge（对齐参考题包 LB3758）：
 *   - problem.yaml.comparison_mode: special_judge（亦接受 special-judge）
 *   - problem.yaml.checker: checker.cpp（显式 checker 文件名）
 *   - 题目目录下放置 Testlib checker 源码
 *
 * 优先级：config.yaml > problem.yaml > 默认值
 * 安全：isStrictSafePath 防 Zip Slip
 */
import AdmZip from 'adm-zip'
import { ApiError } from '@/lib/api/errors'
import { isValidDifficulty } from '@/lib/constants'
import type { ImportedProblem, ImportedSolution, ImportedTestCase } from './types'

/* ============================================================================
 * 归档抽象
 * ========================================================================== */

/**
 * 归档条目（ZIP entry 的最小子集）
 *
 * 仅暴露 dsoj-parser 用到的三个字段：entryName / isDirectory / getData()。
 * 这样除了 AdmZip（ZIP 后端），其他归档后端（tar.xz 适配器）只需实现这个接口
 * 即可复用 parseDsojArchive 主体逻辑，无需重构 dsoj-parser 的所有内部函数。
 */
export interface ArchiveEntry {
  /** 完整路径（路径分隔符统一为 /，与 ZIP 一致） */
  entryName: string
  /** 是否目录条目 */
  isDirectory: boolean
  /** 读取条目数据为 Buffer（UTF-8 文本由 readEntryText 包装） */
  getData(): Buffer
}

/**
 * 归档对象的最小接口
 *
 * dsoj-parser 内部所有函数依赖的方法仅这两个：
 *   - getEntries()：列出所有条目（含目录）
 *   - getEntry(name)：按完整 entryName 精确查找
 *
 * AdmZip 实例天然满足，无需改造；
 * 其他归档后端（如 InMemoryArchive）实现这两个方法即可。
 */
export interface ArchiveLike {
  getEntries(): ArchiveEntry[]
  getEntry(name: string): ArchiveEntry | null
}

/* ============================================================================
 * 常量定义
 * ========================================================================== */

/** 格式标识（pack.yaml.format 必须为这个值） */
const DSOJ_FORMAT_ID = 'dsoj-pack'

/** 支持的格式版本（v1 扫描目录；v2 优先 index.json） */
const DSOJ_SUPPORTED_VERSIONS = new Set(['1.0', '2.0'])

/** 当前推荐格式版本 */
const DSOJ_FORMAT_VERSION = '2.0'

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

/** 单题最多导入的题解篇数（按点赞降序截断） */
const MAX_IMPORTED_SOLUTIONS = 20

/** 不应作为测试点的文件名 */
const TESTCASE_IGNORE_NAMES = new Set(['quality.json', 'config.json', 'config.yaml'])

/* ============================================================================
 * 字段规范（与项目真相源对齐）
 *   - 难度 8 档来自 lib/constants.ts
 *   - visibility/comparison_mode 来自 prisma schema 注释和 admin 校验
 *   - 限制范围来自 lib/problem/admin.ts 的 createAdminProblem / updateAdminProblem
 *   - 测试点上限来自 lib/problem/testcase.ts 的 TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES
 * ========================================================================== */

/** 合法的 visibility 值（与 schema 默认 "public" 一致） */
const VALID_VISIBILITIES = ['public', 'private', 'contest'] as const

/** 合法的 comparison_mode 值（库内统一用连字符） */
const VALID_COMPARISON_MODES = [
  'default',
  'strict',
  'ignore-spaces',
  'real-number',
  'special-judge',
] as const

/**
 * 题包 YAML 中 comparison_mode 别名 → 库内值
 * 参考题包（LB3758）使用 special_judge（下划线）
 */
const COMPARISON_MODE_ALIASES: Record<string, (typeof VALID_COMPARISON_MODES)[number]> = {
  default: 'default',
  strict: 'strict',
  'ignore-spaces': 'ignore-spaces',
  ignore_spaces: 'ignore-spaces',
  'real-number': 'real-number',
  real_number: 'real-number',
  float: 'real-number',
  'special-judge': 'special-judge',
  special_judge: 'special-judge',
  spj: 'special-judge',
  checker: 'special-judge',
}

/** 默认 SPJ 文件名候选（problem.yaml.checker 优先） */
const DEFAULT_CHECKER_FILE_NAMES = ['checker.cpp', 'spj.cpp', 'chk.cpp'] as const

/** 校验 checker 文件名：仅允许题目目录下的简单 .cpp 名，防路径穿越 */
function isSafeCheckerFileName(name: string): boolean {
  const n = name.trim().replace(/^\.\//, '')
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*\.cpp$/i.test(n) && !n.includes('..') && !n.includes('/')
}

/** 将 YAML 中的 comparison_mode 归一化为库内枚举 */
function normalizeComparisonMode(raw: unknown): (typeof VALID_COMPARISON_MODES)[number] | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return COMPARISON_MODE_ALIASES[key] ?? null
}

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
      } else if (value === 'null' || value === '~') {
        currentListKey = null
        result[key] = null
      } else {
        currentListKey = null
        // 版本 / 题号 / 文本字段禁止数字化（避免 version: 2.0 → 2）
        const keepAsString = new Set([
          'format',
          'version',
          'index',
          'title',
          'problem_number',
          'luogu_pid',
          'difficulty',
          'source',
          'visibility',
          'comparison_mode',
          'checker',
          'spj_kind',
          'description',
          'created_at',
        ])
        const num = Number(value)
        if (
          !keepAsString.has(key) &&
          value !== '' &&
          !isNaN(num) &&
          /^-?\d+(\.\d+)?$/.test(value)
        ) {
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
 * 统一 ZIP entry 路径分隔符（Windows 打的包常为 \）
 */
function entryPath(entryName: string): string {
  return String(entryName || '').replace(/\\/g, '/')
}

/**
 * 严格校验 ZIP entry 完整路径安全性（允许 / 作为路径分隔符）
 *
 * 与 testcase.ts 的 isSafeZipEntryName 区别：
 *   - isSafeZipEntryName 用于**单文件名**校验，禁止任何路径分隔符（/、\）
 *   - isStrictSafePath 用于**完整路径**校验，允许 / 但禁止 .. 穿越、绝对路径、盘符等
 *
 * 因此不能复用 isSafeZipEntryName，否则含 / 的合法相对路径（如
 * "problems/0001-a-plus-b/description.md"）会被误判为不安全。
 */
function isStrictSafePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (path.length > 512) return false
  // 统一分隔符检查（\ → /）
  const normalized = entryPath(path)
  // 拒绝绝对路径（/ 开头）
  if (normalized.startsWith('/')) return false
  // 拒绝 Windows 盘符（C:\ 开头）
  if (/^[a-zA-Z]:\//.test(normalized)) return false
  // 拒绝 .. 路径穿越（任意段为 ..）
  if (normalized === '..' || normalized.includes('../') || normalized.includes('/..')) return false
  // 拒绝控制字符（含 NUL）
  if ([...normalized].some((ch) => ch.charCodeAt(0) <= 0x1f)) return false
  // 拒绝 Unicode 路径分隔符（U+2028 / U+2029 / 全角斜杠）
  if (/[\u2028\u2029\uFF0F\uFF3C]/.test(normalized)) return false
  return true
}

/**
 * 获取 ZIP 中所有有效题目目录（problems/ 下的直接子目录）
 *
 * @param rootPrefix 可选根前缀（如 "dsoj-pack/"），兼容单层包裹的 ZIP
 * 返回形如 ["problems/LP1001/", "problems/LB3939/"] 的列表（不含 rootPrefix），
 * 已按目录名排序；v2 若有 index.json 则改由 listProblemDirsFromIndex 决定顺序。
 */
function listProblemDirs(zip: ArchiveLike, rootPrefix = ''): string[] {
  const all = zip.getEntries()
  const problemsPrefix = rootPrefix + PROBLEMS_DIR
  const dirs = new Set<string>()
  for (const entry of all) {
    const name = entryPath(entry.entryName)
    if (!name.startsWith(problemsPrefix)) continue
    const rest = name.slice(problemsPrefix.length)
    if (!rest) continue
    const slashIdx = rest.indexOf('/')
    if (slashIdx <= 0) continue
    const dirName = rest.slice(0, slashIdx)
    if (!dirName || dirName.startsWith('.')) continue
    if (!isStrictSafePath(dirName)) continue
    dirs.add(PROBLEMS_DIR + dirName + '/')
  }
  return Array.from(dirs).sort()
}

/**
 * 检测 ZIP 是否被单层目录包裹（如 dsoj-pack/pack.yaml）
 * 扁平 ZIP（pack.yaml 在根）返回空串。
 */
function detectZipRootPrefix(zip: ArchiveLike): string {
  const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'))
  if (names.some((n) => n === 'pack.yaml' || n.startsWith(PROBLEMS_DIR))) {
    return ''
  }
  const tops = new Set<string>()
  for (const n of names) {
    const i = n.indexOf('/')
    if (i > 0) tops.add(n.slice(0, i + 1))
  }
  if (tops.size !== 1) return ''
  const root = [...tops][0]
  if (
    names.some(
      (n) => n === `${root}pack.yaml` || n.startsWith(`${root}${PROBLEMS_DIR}`)
    )
  ) {
    return root
  }
  return ''
}

function getZipEntry(zip: ArchiveLike, rootPrefix: string, relativePath: string): ArchiveEntry | null {
  const entry = zip.getEntry(rootPrefix + relativePath)
  if (!entry || entry.isDirectory) return null
  return entry
}

interface PackIndexProblem {
  order: number
  pid?: string
  luogu_pid?: string
  dir: string
  title?: string
  difficulty?: string
  tags?: string[]
}

/**
 * 从 index.json 读取题目目录顺序（v2 权威入口）
 * 无效 / 缺失时返回 null，由调用方回退到目录扫描。
 */
function listProblemDirsFromIndex(
  zip: ArchiveLike,
  rootPrefix: string,
  indexFileName: string
): PackIndexProblem[] | null {
  const entry = getZipEntry(zip, rootPrefix, indexFileName)
  if (!entry) return null
  try {
    const raw = JSON.parse(readEntryText(entry))
    const list = Array.isArray(raw?.problems) ? raw.problems : null
    if (!list || list.length === 0) return null

    const items: PackIndexProblem[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const dir = String(item.dir || item.pid || '').trim()
      if (!dir || !isStrictSafePath(dir)) continue
      const order = Number(item.order)
      items.push({
        order: Number.isFinite(order) ? order : items.length + 1,
        pid: typeof item.pid === 'string' ? item.pid : undefined,
        luogu_pid: typeof item.luogu_pid === 'string' ? item.luogu_pid : undefined,
        dir,
        title: typeof item.title === 'string' ? item.title : undefined,
        difficulty: typeof item.difficulty === 'string' ? item.difficulty : undefined,
        tags: Array.isArray(item.tags)
          ? item.tags.map(String).map((s: string) => s.trim()).filter(Boolean)
          : undefined,
      })
    }
    if (items.length === 0) return null
    items.sort((a, b) => a.order - b.order || a.dir.localeCompare(b.dir))
    return items
  } catch {
    return null
  }
}

/**
 * 在指定题目目录下查找文件
 *   candidates 是相对题目目录的文件名（如 "problem.yaml"）
 *   返回 entry 或 null
 */
function findFileUnderProblemDir(
  zip: ArchiveLike,
  problemDir: string,
  candidates: readonly string[],
  rootPrefix = ''
): ArchiveEntry | null {
  const all = zip.getEntries()
  for (const c of candidates) {
    const path = rootPrefix + problemDir + c
    for (const entry of all) {
      if (entry.isDirectory) continue
      if (entryPath(entry.entryName) === path) return entry
    }
  }
  return null
}

/**
 * 在指定题目目录下查找子目录
 *   candidates 是相对题目目录的目录名（如 "testcases"）
 *   返回完整目录前缀（含 problemDir，不含 rootPrefix）或 null
 * @param allowNested 为 true 时允许子目录内有文件（samples/1/in.txt）；
 *                    testcases 默认只要直接子文件，避免误扫过程产物目录
 */
function findSubdirUnderProblemDir(
  zip: ArchiveLike,
  problemDir: string,
  candidates: readonly string[],
  rootPrefix = '',
  allowNested = false
): string | null {
  const all = zip.getEntries()
  for (const c of candidates) {
    const relativePrefix = problemDir + c + '/'
    const fullPrefix = rootPrefix + relativePrefix
    const hasFile = all.some((e) => {
      if (e.isDirectory) return false
      const name = entryPath(e.entryName)
      if (!name.startsWith(fullPrefix)) return false
      const rest = name.slice(fullPrefix.length)
      if (!rest) return false
      if (!allowNested && rest.includes('/')) return false
      return true
    })
    if (hasFile) return relativePrefix
  }
  return null
}

/** 读取 entry 文本内容（UTF-8） */
function readEntryText(entry: ArchiveEntry | null): string {
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
  zip: ArchiveLike,
  testcasesDir: string
): ImportedTestCase[] {
  const all = zip.getEntries()
  const prefix = testcasesDir

  // 收集目录下所有文件
  const files: Array<{ name: string; entry: ArchiveEntry }> = []
  for (const entry of all) {
    if (entry.isDirectory) continue
    const fullName = entryPath(entry.entryName)
    if (!fullName.startsWith(prefix)) continue
    const filename = fullName.slice(prefix.length)
    // 必须是直接子文件（不能嵌套目录）
    if (!filename || filename.includes('/')) continue
    if (!isStrictSafePath(filename)) continue
    files.push({ name: filename, entry })
  }

  // 按编号分组：input / output / score
  const groups = new Map<number, { input?: string; output?: string; score?: number }>()

  for (const { name, entry } of files) {
    if (TESTCASE_IGNORE_NAMES.has(name.toLowerCase())) continue
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
 * 解析 samples/ 下相对路径中的「编号 + 输入/输出角色」
 * 支持：
 *   - 1.in / 1.out / 1.ans
 *   - sample1.in / test2.out（与 testcases 命名习惯对齐）
 *   - 1/in.txt、1/input.txt、1/1.in（一层子目录）
 */
function parseSampleFileRole(
  relativePath: string
): { num: number; role: 'in' | 'out' } | null {
  const name = entryPath(relativePath)
  if (!name || name.split('/').length > 2) return null

  // 扁平：1.in / sample1.out / test2.ans
  const flat = name.match(/^(?:sample|samp|s|test|t)?(\d+)\.(in|out|ans)$/i)
  if (flat) {
    const num = parseInt(flat[1], 10)
    if (!Number.isFinite(num) || num <= 0) return null
    const ext = flat[2].toLowerCase()
    return { num, role: ext === 'in' ? 'in' : 'out' }
  }

  // 一层子目录：1/in.txt、1/input、1/1.in、1/output.txt
  const nested = name.match(/^(\d+)\/([^/]+)$/i)
  if (!nested) return null
  const num = parseInt(nested[1], 10)
  if (!Number.isFinite(num) || num <= 0) return null
  const leaf = nested[2].toLowerCase()
  if (
    leaf === 'in' ||
    leaf === 'input' ||
    leaf === 'in.txt' ||
    leaf === 'input.txt' ||
    /^\d+\.in$/.test(leaf)
  ) {
    return { num, role: 'in' }
  }
  if (
    leaf === 'out' ||
    leaf === 'ans' ||
    leaf === 'output' ||
    leaf === 'out.txt' ||
    leaf === 'ans.txt' ||
    leaf === 'output.txt' ||
    /^\d+\.(out|ans)$/.test(leaf)
  ) {
    return { num, role: 'out' }
  }
  return null
}

/**
 * 从 samples/ 目录提取展示样例（仅用于题面，不进入评测点）
 *
 * 文件名约定：
 *   - 1.in / 1.out
 *   - sample1.in / test1.out
 *   - 1/in.txt + 1/out.txt
 */
function extractSamples(
  zip: ArchiveLike,
  samplesDir: string
): Array<{ input: string; output: string }> {
  const all = zip.getEntries()
  const prefix = samplesDir

  const groups = new Map<number, { input?: string; output?: string }>()

  for (const entry of all) {
    if (entry.isDirectory) continue
    const fullName = entryPath(entry.entryName)
    if (!fullName.startsWith(prefix)) continue
    const filename = fullName.slice(prefix.length)
    if (!filename || filename.includes('..')) continue
    if (!isStrictSafePath(filename)) continue

    const parsed = parseSampleFileRole(filename)
    if (!parsed) continue

    if (!groups.has(parsed.num)) groups.set(parsed.num, {})
    const group = groups.get(parsed.num)!
    if (parsed.role === 'in') {
      group.input = readEntryText(entry)
    } else {
      group.output = readEntryText(entry)
    }
  }

  const result: Array<{ input: string; output: string }> = []
  const sortedNums = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const num of sortedNums) {
    const g = groups.get(num)!
    if (g.input === undefined && g.output === undefined) continue
    result.push({
      input: g.input ?? '',
      output: g.output ?? '',
    })
  }
  return result
}

/**
 * 从 solutions/ 提取题解（可选）
 * 优先读 solutions/index.json，按 thumb_up 降序截断；忽略 _runnable/ 等 AI 缓存。
 */
function extractSolutions(
  zip: ArchiveLike,
  problemDir: string,
  rootPrefix = ''
): ImportedSolution[] {
  const indexEntry = findFileUnderProblemDir(
    zip,
    problemDir,
    ['solutions/index.json'],
    rootPrefix
  )
  type IndexItem = {
    lid?: string
    title?: string
    author?: string
    thumb_up?: number
    file?: string
  }
  let items: IndexItem[] = []

  if (indexEntry) {
    try {
      const raw = JSON.parse(readEntryText(indexEntry))
      if (Array.isArray(raw?.solutions)) items = raw.solutions
    } catch {
      items = []
    }
  }

  if (items.length === 0) {
    // 无 index 时扫描 solutions/*.md（排除子目录）
    const prefix = rootPrefix + problemDir + 'solutions/'
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const name = entry.entryName.replace(/\\/g, '/')
      if (!name.startsWith(prefix)) continue
      const rest = name.slice(prefix.length)
      if (!rest || rest.includes('/') || !rest.toLowerCase().endsWith('.md')) continue
      if (rest.startsWith('_')) continue
      items.push({ file: rest, title: rest.replace(/\.md$/i, ''), lid: rest.replace(/\.md$/i, '') })
    }
  }

  items.sort((a, b) => (Number(b.thumb_up) || 0) - (Number(a.thumb_up) || 0))

  const results: ImportedSolution[] = []
  for (const item of items.slice(0, MAX_IMPORTED_SOLUTIONS)) {
    const fileName = String(item.file || (item.lid ? `${item.lid}.md` : ''))
      .replace(/\\/g, '/')
      .split('/')
      .pop()
    if (!fileName || !fileName.toLowerCase().endsWith('.md')) continue
    if (!isStrictSafePath(fileName) || fileName.startsWith('_')) continue

    const entry = findFileUnderProblemDir(
      zip,
      problemDir,
      [`solutions/${fileName}`],
      rootPrefix
    )
    if (!entry) continue

    let content = readEntryText(entry).replace(/^\uFEFF/, '')
    // 文首元数据 + --- + 正文
    const sepMatch = content.match(/\r?\n---\r?\n/)
    if (sepMatch && sepMatch.index != null) {
      content = content.slice(sepMatch.index + sepMatch[0].length).trim()
    }
    if (!content.trim()) continue

    const title = String(item.title || fileName.replace(/\.md$/i, '')).trim() || '题解'
    results.push({
      title: title.slice(0, 200),
      content,
      authorName: typeof item.author === 'string' ? item.author : undefined,
      thumbUp: Number.isFinite(Number(item.thumb_up)) ? Number(item.thumb_up) : undefined,
      externalId: typeof item.lid === 'string' ? item.lid : undefined,
    })
  }
  return results
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
  comparisonMode: 'default' | 'strict' | 'ignore-spaces' | 'real-number' | 'special-judge'
  realPrecision: number
} {
  /**
   * 从 yaml 取数值字段：config.yaml 优先，其次 problem.yaml，再否则用 default
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
    // 其次 problem.yaml
    const pv = problemYaml[key]
    if (pv !== undefined && pv !== null && !Array.isArray(pv)) {
      const n = Number(pv)
      if (Number.isFinite(n) && n >= min && n <= max) return Math.round(n)
    }
    return fallback
  }

  /**
   * 从 yaml 取枚举字段：config.yaml 优先，其次 problem.yaml，非法/缺失用 default
   * comparison_mode 额外支持 special_judge 等别名
   */
  const getEnum = <T extends string>(
    key: string,
    validValues: readonly T[],
    fallback: T
  ): T => {
    const tryResolve = (raw: unknown): T | null => {
      if (key === 'comparison_mode') {
        const normalized = normalizeComparisonMode(raw)
        return normalized && (validValues as readonly string[]).includes(normalized)
          ? (normalized as T)
          : null
      }
      if (typeof raw === 'string' && (validValues as readonly string[]).includes(raw)) {
        return raw as T
      }
      return null
    }
    return tryResolve(configYaml?.[key]) ?? tryResolve(problemYaml[key]) ?? fallback
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
 *   problemDir 形如 "problems/LP1001/"
 *   rootPrefix 兼容单层包裹 ZIP（如 "dsoj-pack/"）
 *   indexMeta 来自 index.json（可选，用于补全题号/标题）
 */
function parseOneProblem(
  zip: ArchiveLike,
  problemDir: string,
  rootPrefix = '',
  indexMeta?: PackIndexProblem
): ImportedProblem {
  // 1. 必需文件校验
  for (const required of REQUIRED_FILES) {
    const entry = findFileUnderProblemDir(zip, problemDir, [required], rootPrefix)
    if (!entry) {
      throw new ApiError(
        'MISSING_REQUIRED_FILE',
        `题目目录 ${problemDir} 缺少必需文件: ${required}`,
        400
      )
    }
  }

  // 2. 读取 problem.yaml
  const problemYamlEntry = findFileUnderProblemDir(zip, problemDir, ['problem.yaml'], rootPrefix)
  const problemYamlText = readEntryText(problemYamlEntry)
  const problemYaml = parseDsojYaml(problemYamlText)

  // 3. 读取必需字段：title（index.json 可兜底）
  const titleFromYaml = typeof problemYaml.title === 'string'
    ? problemYaml.title.trim()
    : ''
  const title = titleFromYaml || indexMeta?.title?.trim() || ''
  if (!title) {
    throw new ApiError(
      'MISSING_TITLE',
      `题目目录 ${problemDir} 的 problem.yaml 缺少 title 字段`,
      400
    )
  }

  // 4. 读取 markdown 文件
  const description = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['description.md'], rootPrefix)
  )
  if (!description.trim()) {
    throw new ApiError(
      'EMPTY_DESCRIPTION',
      `题目目录 ${problemDir} 的 description.md 为空`,
      400
    )
  }
  const background = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['background.md'], rootPrefix)
  ) || undefined
  const input = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['input.md'], rootPrefix)
  )
  const output = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['output.md'], rootPrefix)
  )
  const hint = readEntryText(
    findFileUnderProblemDir(zip, problemDir, ['hint.md'], rootPrefix)
  ) || undefined

  // 5. 读取 config.yaml（可选）
  const configEntry = findFileUnderProblemDir(zip, problemDir, ['config.yaml'], rootPrefix)
  const configYaml = configEntry ? parseDsojYaml(readEntryText(configEntry)) : null

  // 6. 合并评测配置
  const judgeConfig = mergeJudgeConfig(problemYaml, configYaml)

  // 7. 提取测试用例（忽略 quality.json / generator.py 等过程产物）
  const testcasesDir = findSubdirUnderProblemDir(
    zip,
    problemDir,
    TESTCASES_DIR_NAMES,
    rootPrefix
  )
  let testCases: ImportedTestCase[] = []
  if (testcasesDir) {
    testCases = extractTestcases(zip, rootPrefix + testcasesDir)
  }
  if (testCases.length === 0) {
    throw new ApiError(
      'NO_TESTCASES',
      `题目目录 ${problemDir} 缺少测试用例（testcases/ 目录为空或不存在）`,
      400
    )
  }

  // 8. 提取展示样例：仅来自 samples/，绝不把 testcases 混进题面样例
  //    仅当完全没有 samples/ 目录时，才用前 2 个测试点作为展示兜底
  const samplesDir = findSubdirUnderProblemDir(
    zip,
    problemDir,
    SAMPLES_DIR_NAMES,
    rootPrefix,
    true // 允许 samples/1/in.txt 一类嵌套
  )
  let samples: Array<{ input: string; output: string }> = []
  if (samplesDir) {
    samples = extractSamples(zip, rootPrefix + samplesDir)
    // samples/ 存在但解析为空时，回退用前 2 个评测点作展示样例
    if (samples.length === 0 && testCases.length > 0) {
      samples = testCases.slice(0, 2).map((tc) => ({
        input: tc.input,
        output: tc.output,
      }))
    }
  } else if (testCases.length > 0) {
    samples = testCases.slice(0, 2).map((tc) => ({
      input: tc.input,
      output: tc.output,
    }))
  }

  // 9. 读取标程（支持 .cpp/.c/.py，通过扩展名识别语言）
  const stdEntry = findFileUnderProblemDir(zip, problemDir, STD_FILE_NAMES, rootPrefix)
  let stdCode: string | undefined
  let stdLang: string | undefined
  if (stdEntry) {
    stdCode = readEntryText(stdEntry)
    const ext = stdEntry.entryName.toLowerCase().split('.').pop()
    if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') {
      stdLang = 'cpp'
    } else if (ext === 'c') {
      stdLang = 'c'
    } else if (ext === 'py') {
      stdLang = 'python'
    } else {
      stdLang = 'cpp'
    }
  }

  // 10. Special Judge（对齐 LB3758：comparison_mode + checker 字段 + checker.cpp）
  const checkerFromYaml = (() => {
    const raw =
      (typeof configYaml?.checker === 'string' && configYaml.checker) ||
      (typeof problemYaml.checker === 'string' && problemYaml.checker) ||
      ''
    const name = String(raw).trim().replace(/^\.\//, '')
    return isSafeCheckerFileName(name) ? name : ''
  })()
  const checkerCandidates = [
    ...(checkerFromYaml ? [checkerFromYaml] : []),
    ...DEFAULT_CHECKER_FILE_NAMES.filter((n) => n !== checkerFromYaml),
  ]
  const spjEntry = findFileUnderProblemDir(zip, problemDir, checkerCandidates, rootPrefix)
  const spjCode = spjEntry ? readEntryText(spjEntry) : undefined
  const spjCodeTrimmed = spjCode?.trim() || undefined

  let comparisonMode = judgeConfig.comparisonMode
  if (spjCodeTrimmed) {
    comparisonMode = 'special-judge'
  } else if (comparisonMode === 'special-judge') {
    throw new ApiError(
      'MISSING_CHECKER',
      `题目 ${problemDir} 声明了 Special Judge（comparison_mode=special_judge），但未找到 checker 源码` +
        (checkerFromYaml ? `（已声明 checker=${checkerFromYaml}）` : '（请放置 checker.cpp）'),
      400
    )
  }

  // 11. 解析 tags（yaml 优先，index.json 兜底）
  const rawTags = problemYaml.tags
  let tags: string[] = Array.isArray(rawTags)
    ? rawTags.map(String).map(s => s.trim()).filter(Boolean)
    : (typeof rawTags === 'string' && rawTags.trim() ? [rawTags.trim()] : [])
  if (tags.length === 0 && indexMeta?.tags?.length) {
    tags = indexMeta.tags
  }
  if (
    comparisonMode === 'special-judge' &&
    !tags.some((t) => String(t).toLowerCase() === 'special judge')
  ) {
    tags = [...tags, 'Special Judge']
  }

  // 12. 解析 difficulty
  const rawDifficulty = typeof problemYaml.difficulty === 'string'
    ? problemYaml.difficulty.trim()
    : (indexMeta?.difficulty ? String(indexMeta.difficulty).trim() : '')
  const difficulty = isValidDifficulty(rawDifficulty) ? rawDifficulty : '入门'

  // 13. 其它字段
  const source = typeof problemYaml.source === 'string'
    ? problemYaml.source.trim()
    : 'DSOJ Pack'
  const dirSlug = problemDir.replace(PROBLEMS_DIR, '').replace(/\/$/, '')
  const problemNumberRaw = typeof problemYaml.problem_number === 'string'
    ? problemYaml.problem_number.trim()
    : ''
  const problemNumber =
    problemNumberRaw ||
    indexMeta?.pid?.trim() ||
    (dirSlug && !/^\d{4}-/.test(dirSlug) ? dirSlug : undefined)

  const rawVisibility = typeof problemYaml.visibility === 'string'
    ? problemYaml.visibility.trim().toLowerCase()
    : ''
  const visibility = (VALID_VISIBILITIES as readonly string[]).includes(rawVisibility)
    ? (rawVisibility as 'public' | 'private' | 'contest')
    : undefined

  const luoguPidRaw =
    (typeof problemYaml.luogu_pid === 'string' ? problemYaml.luogu_pid.trim() : '') ||
    indexMeta?.luogu_pid?.trim() ||
    ''

  // 14. 可选题解
  const solutions = extractSolutions(zip, problemDir, rootPrefix)

  return {
    title,
    description,
    background,
    input,
    output,
    samples,
    hint,
    source,
    difficulty,
    tags,
    timeLimit: judgeConfig.timeLimit,
    memoryLimit: judgeConfig.memoryLimit,
    comparisonMode,
    realPrecision: judgeConfig.realPrecision,
    stdCode,
    stdLang,
    spjCode: spjCodeTrimmed,
    testCases,
    solutions: solutions.length > 0 ? solutions : undefined,
    problemNumber: problemNumber || undefined,
    externalId: luoguPidRaw || dirSlug,
    visibility,
  }
}

/* ============================================================================
 * 主入口
 * ========================================================================== */

/**
 * 单题解析结果（detailed 模式）：按题包原始顺序返回每题成功或失败
 * - ok: true  → problem 为该题解析产物
 * - ok: false → dir 为题目目录、reason 为失败原因、title 尽量取 index.json 中的标题
 */
export type DsojParseJobResult =
  | { ok: true; index: number; problem: ImportedProblem }
  | { ok: false; index: number; dir: string; reason: string; title?: string }

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

  let zip: ArchiveLike
  try {
    zip = new AdmZip(zipBuffer) as unknown as ArchiveLike
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApiError('INVALID_DSOJ_ZIP', `ZIP 解压失败: ${msg}`, 400)
  }

  return parseDsojArchive(zip)
}

/**
 * 解析 DSOJ 标准题包归档对象（zip / tar.xz 等统一入口），按原始顺序返回每题结果
 *
 * 与 parseDsojZip 的区别：parseDsojZip 接受 ZIP Buffer 并自行 new AdmZip；
 * 本函数接受任意实现了 ArchiveLike 接口的归档对象（如 ZIP、tar.xz 适配器），
 * 便于支持多种归档格式，复用主体解析逻辑。
 *
 * detailed 模式：即使部分/全部题目解析失败也不抛错，只返回结果数组；
 * 全局校验错误（不安全路径、pack.yaml 非法、无题目目录等）仍照常抛出。
 *
 * @param archive 已打开的归档对象
 * @returns DsojParseJobResult[] 按题包原始顺序的每题解析结果（成功或失败+原因）
 * @throws ApiError 全局校验错误（UNSAFE_ZIP_ENTRY / FORMAT_MISMATCH / UNSUPPORTED_VERSION / INVALID_INDEX / NO_PROBLEMS）
 */
export function parseDsojArchiveDetailed(archive: ArchiveLike): DsojParseJobResult[] {
  for (const entry of archive.getEntries()) {
    if (entry.isDirectory) continue
    if (!isStrictSafePath(entry.entryName)) {
      throw new ApiError(
        'UNSAFE_ZIP_ENTRY',
        `归档内文件名不安全: ${entry.entryName}`,
        400
      )
    }
  }

  const rootPrefix = detectZipRootPrefix(archive)

  // pack.yaml：校验 format / version，读取 index 文件名
  let indexFileName = 'index.json'
  const packEntry = getZipEntry(archive, rootPrefix, 'pack.yaml')
  if (packEntry) {
    const packYaml = parseDsojYaml(readEntryText(packEntry))
    const format = typeof packYaml.format === 'string' ? packYaml.format : ''
    if (format && format !== DSOJ_FORMAT_ID) {
      throw new ApiError(
        'FORMAT_MISMATCH',
        `pack.yaml 的 format 字段应为 "${DSOJ_FORMAT_ID}"，实际为 "${format}"`,
        400
      )
    }
    const version = typeof packYaml.version === 'string' ? String(packYaml.version) : ''
    if (version && !DSOJ_SUPPORTED_VERSIONS.has(version)) {
      throw new ApiError(
        'UNSUPPORTED_VERSION',
        `不支持的题包版本 "${version}"（支持 ${[...DSOJ_SUPPORTED_VERSIONS].join(' / ')}）`,
        400
      )
    }
    if (typeof packYaml.index === 'string' && packYaml.index.trim()) {
      const name = packYaml.index.trim().replace(/\\/g, '/')
      if (name.includes('..') || name.includes('/')) {
        throw new ApiError('INVALID_INDEX', 'pack.yaml.index 非法', 400)
      }
      indexFileName = name
    }
  }

  // v2：优先 index.json；失败则扫描 problems/*
  const indexed = listProblemDirsFromIndex(archive, rootPrefix, indexFileName)
  const problemJobs: Array<{ dir: string; meta?: PackIndexProblem }> = indexed
    ? indexed.map((item) => ({
        dir: PROBLEMS_DIR + item.dir.replace(/^\/+|\/+$/g, '') + '/',
        meta: item,
      }))
    : listProblemDirs(archive, rootPrefix).map((dir) => ({ dir }))

  if (problemJobs.length === 0) {
    throw new ApiError(
      'NO_PROBLEMS',
      '题包未找到任何题目目录（应在 problems/ 下创建题目子目录，或提供 index.json）',
      400
    )
  }

  const results: DsojParseJobResult[] = []
  for (let i = 0; i < problemJobs.length; i++) {
    const job = problemJobs[i]
    try {
      results.push({
        ok: true,
        index: i,
        problem: parseOneProblem(archive, job.dir, rootPrefix, job.meta),
      })
    } catch (err: unknown) {
      const reason =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误'
      results.push({ ok: false, index: i, dir: job.dir, reason, title: job.meta?.title })
    }
  }
  return results
}

/**
 * 解析 DSOJ 标准题包归档对象（zip / tar.xz 等统一入口）
 *
 * 与 parseDsojZip 的区别：parseDsojZip 接受 ZIP Buffer 并自行 new AdmZip；
 * 本函数接受任意实现了 ArchiveLike 接口的归档对象（如 ZIP、tar.xz 适配器），
 * 便于支持多种归档格式，复用主体解析逻辑。
 *
 * 保持兼容，见 parseDsojArchiveDetailed：部分题目失败只返回成功项，
 * 全部失败抛 ALL_PROBLEMS_FAILED。
 *
 * @param archive 已打开的归档对象
 * @returns ImportedProblem[] 已解析的题目列表
 * @throws ApiError 格式错误、文件缺失、安全校验失败等
 */
export function parseDsojArchive(archive: ArchiveLike): ImportedProblem[] {
  const detailed = parseDsojArchiveDetailed(archive)
  const results: ImportedProblem[] = []
  const errors: Array<{ dir: string; reason: string }> = []
  for (const item of detailed) {
    if (item.ok) results.push(item.problem)
    else errors.push({ dir: item.dir, reason: item.reason })
  }
  if (results.length === 0) {
    const detail = errors.map((e) => `${e.dir}: ${e.reason}`).join('; ')
    throw new ApiError(
      'ALL_PROBLEMS_FAILED',
      `题包中所有题目解析失败。详情: ${detail}`,
      400
    )
  }
  return results
}

/**
 * 检测一个 ZIP buffer 是否是 DSOJ 标准题包
 *   通过 pack.yaml.format 字段判断（兼容单层包裹）
 */
export function isDsojPack(zipBuffer: Buffer): boolean {
  try {
    const zip = new AdmZip(zipBuffer) as unknown as ArchiveLike
    return isDsojPackArchive(zip)
  } catch {
    return false
  }
}

/**
 * 检测一个归档对象是否是 DSOJ 标准题包（zip / tar.xz 通用）
 *   通过 pack.yaml.format 字段判断（兼容单层包裹）
 */
export function isDsojPackArchive(archive: ArchiveLike): boolean {
  try {
    const rootPrefix = detectZipRootPrefix(archive)
    const packEntry = getZipEntry(archive, rootPrefix, 'pack.yaml')
    if (!packEntry) return false
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
