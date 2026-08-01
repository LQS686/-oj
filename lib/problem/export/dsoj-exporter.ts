/**
 * lib/problem/export/dsoj-exporter.ts
 * DSOJ 标准题包导出器（与 dsoj-parser 配套使用）
 *
 * 将数据库中的题目导出为 DSOJ 标准格式包（v2），可由 dsoj-parser 重新导入，
 * 实现完整的导出 → 导入闭环。
 *
 * 支持两种归档格式：
 *   - zip（默认）：archiver + zlib level=1，速度快
 *   - tar.xz：tar-stream + lzma-native，体积比 zip 再降 20-35%，但压缩慢 5-10 倍
 *
 * 导出包结构：
 *   dsoj-pack.{zip|tar.xz}
 *   ├── pack.yaml
 *   ├── index.json
 *   └── problems/
 *       ├── <题号>/             # 如 LP1001 / P1001
 *       │   ├── problem.yaml
 *       │   ├── description.md
 *       │   ├── samples/
 *       │   ├── testcases/
 *       │   ├── solutions/
 *       │   ├── std.cpp
 *       │   └── checker.cpp     # Special Judge（Testlib）
 *       └── ...
 *
 * 流式实现（v2.2）：
 *   - 通过 DsojArchiveWriter 接口统一 zip / tar.xz 两种后端
 *   - 数据库按批次加载（默认每批 50 题），单题内存峰值
 *   - 通过 ReadableStream 直接写入 HTTP Response，首字节时间大幅下降
 *   - 支持导出 1000+ 题而不触发 OOM
 */
import { ZipArchive } from 'archiver'
import type { Archiver } from 'archiver'
import { pack as tarPack } from 'tar-stream'
import type { Pack as TarPack, Headers as TarHeaders } from 'tar-stream'
import { createCompressor as createLzmaCompressor } from 'lzma-native'
import { PassThrough } from 'node:stream'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { deriveLuoguPid, makePackDirName } from '@/lib/problem/pack-ids'

/* ============================================================================
 * 类型定义
 * ========================================================================== */

export interface DsojExportOptions {
  /** 题目 ID 列表（与 filter 二选一） */
  problemIds?: string[]
  /** 是否导出标程代码（默认 true） */
  includeStdCode?: boolean
  /** 是否导出测试用例（默认 true，强烈建议保持 true） */
  includeTestCases?: boolean
  /** 是否导出题解（默认 true） */
  includeSolutions?: boolean
  /** 包级描述（写入 pack.yaml.description） */
  description?: string
  /** 数据来源（写入 pack.yaml.source） */
  packSource?: string
  /** 单批查询题数（流式导出用，默认 50） */
  batchSize?: number
}

/** 导出进度回调，用于上层推送日志/Socket 进度 */
export interface DsojExportProgress {
  /** 已处理题数 */
  processed: number
  /** 成功题数 */
  success: number
  /** 失败题数 */
  failed: number
  /** 总题数 */
  total: number
  /** 当前题目标题（可选，便于日志展示） */
  currentTitle?: string
}

/** 归档后端类型 */
export type DsojArchiveFormat = 'zip' | 'tar.xz'

/**
 * 归档写入器统一接口
 *
 * 抽象出 zip / tar.xz 两种实现的共性：
 *   - append：追加一个文件到归档
 *   - finalize：完成归档（调用方负责）
 *
 * Archiver（zip）和 tar-stream.Pack（tar）API 风格不同：
 *   - Archiver.append 是同步的，立即返回
 *   - tarPack.entry 是 callback 风格，需 promisify
 *
 * 因此接口统一为异步 append，便于 tar 后端正确处理背压。
 */
export interface DsojArchiveWriter {
  /** 追加一个文件到归档（异步，支持背压） */
  append(content: Buffer, name: string): Promise<void>
  /** 完成归档，关闭流 */
  finalize(): Promise<void>
}

/** 当前格式版本 */
const DSOJ_PACK_VERSION = '2.0'
const DSOJ_PACK_FORMAT_ID = 'dsoj-pack'

/** 默认每批查询题数 */
const DEFAULT_BATCH_SIZE = 50

/* ============================================================================
 * 归档写入器实现
 * ========================================================================== */

/**
 * ZIP 写入器：包装 archiver.ZipArchive
 *
 * zlib level=1 速度优先：OJ 题目测试点多为文本/二进制可压缩率有限，
 * 高压缩等级会显著拖慢 CPU 而体积收益甚微。
 *
 * archiver v8 起为纯 ESM，原 default 工厂函数已废弃，改用 ZipArchive 类。
 */
export class ZipArchiveWriter implements DsojArchiveWriter {
  private readonly archive: Archiver
  readonly output: PassThrough

  constructor() {
    this.archive = new ZipArchive({
      zlib: { level: 1 },
      forceZip64: false,
    }) as Archiver
    this.output = new PassThrough()
    this.archive.pipe(this.output)
  }

  async append(content: Buffer, name: string): Promise<void> {
    // Archiver.append 同步立即返回，背压通过内部队列管理
    this.archive.append(content, { name })
  }

  async finalize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.output.on('error', reject)
      this.archive.on('end', () => resolve())
      this.archive.on('warning', (err) => {
        // archiver warning 默认可恢复，仅记录
        logger.warn('archiver warning', { error: err.message })
      })
      this.archive.on('error', reject)
      this.archive.finalize()
    })
  }
}

/**
 * tar.xz 写入器：tar-stream.Pack → lzma-native.createCompressor → PassThrough
 *
 * LZMA preset=1 速度优先（xz 默认 preset=6 慢 5-10 倍）
 * 题包测试点多为文本，preset=1 已能取得 20-35% 体积收益
 *
 * 链路：
 *   tarPack.entry(header, buffer, cb)  # 写 tar entry
 *   → tarPack (Readable) → lzma Compressor (Transform) → PassThrough (Readable)
 *
 * 调用方拿到 this.output 直接转 Web ReadableStream 作为 Response body
 */
export class TarXzArchiveWriter implements DsojArchiveWriter {
  private readonly tar: TarPack
  readonly lzma: ReturnType<typeof createLzmaCompressor>
  readonly output: PassThrough

  constructor(preset: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 1) {
    this.tar = tarPack()
    this.lzma = createLzmaCompressor({
      preset,
      // CRC64 是 xz 默认校验，CRC32 兼容性更广但校验强度弱
      check: 'CHECK_CRC64',
      // 多线程编码（如有可用核心）减少压缩耗时
      threads: 0,
    })
    this.output = new PassThrough()
    this.tar.pipe(this.lzma).pipe(this.output)
  }

  async append(content: Buffer, name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const header: TarHeaders = {
        name,
        type: 'file',
        size: content.length,
        mode: 0o644,
        mtime: new Date(),
      }
      this.tar.entry(header, content, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async finalize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // tar-stream 的 finalize 是同步的，但压缩链需要 drain
      this.output.on('error', reject)
      this.tar.on('error', reject)
      this.lzma.on('error', reject)
      // lzma 流 end 后表示压缩完成
      this.lzma.on('end', () => resolve())
      this.tar.finalize()
    })
  }
}

/**
 * 创建归档写入器
 *
 * @param format 归档格式
 * @returns 写入器实例（output 属性为 PassThrough，作为 Response body）
 */
export function createDsojArchiveWriter(
  format: DsojArchiveFormat
): DsojArchiveWriter & { output: PassThrough } {
  if (format === 'tar.xz') {
    return new TarXzArchiveWriter()
  }
  return new ZipArchiveWriter()
}

/* ============================================================================
 * 题目数据加载（分批流式）
 * ========================================================================== */

/**
 * 单批查询题目（含 testCases / solutions）
 *
 * 按 ids 顺序返回，便于上层保持勾选顺序。
 * 不再一次性加载所有题目，避免内存激增。
 *
 * 注意：所有 include 字段固定加载，序列化阶段根据 options 决定是否写入归档。
 */
async function loadProblemBatch(
  ids: string[]
): Promise<Prisma.ProblemGetPayload<{
  include: {
    testCases: { orderBy: { orderIndex: 'asc' } }
    solutions: {
      orderBy: ({ isOfficial: 'desc' } | { views: 'desc' } | { createdAt: 'desc' })[]
      take: number
      include: { author: { select: { nickname: true, username: true } } }
    }
  }
}>[]> {
  const problems = await prisma.problem.findMany({
    where: { id: { in: ids } },
    include: {
      testCases: { orderBy: { orderIndex: 'asc' } },
      solutions: {
        orderBy: [{ isOfficial: 'desc' }, { views: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: {
          author: { select: { nickname: true, username: true } },
        },
      },
    },
  })

  // 按入参 ids 顺序排序（findMany 不保证顺序）
  const order = new Map(ids.map((id, i) => [id, i]))
  return problems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

type ExportProblem = Awaited<ReturnType<typeof loadProblemBatch>>[number]

type ExportSample = {
  input?: unknown
  output?: unknown
}

/* ============================================================================
 * YAML 序列化（极简实现，与 dsoj-parser 的 parseDsojYaml 对应）
 * ========================================================================== */

/**
 * 将简单对象序列化为 YAML 文本
 *   支持的值类型：string / number / string[] / null
 *   字符串值若含特殊字符（:、#、引号、前后空格）会自动加引号
 */
function serializeYaml(data: Record<string, string | number | string[] | null | undefined>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
        continue
      }
      lines.push(`${key}:`)
      for (const item of value) {
        const s = String(item)
        lines.push(`  - ${quoteIfNeeded(s)}`)
      }
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`)
    } else {
      const s = String(value)
      lines.push(`${key}: ${quoteIfNeeded(s)}`)
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * 若字符串含 YAML 特殊字符或前后空格，则用单引号包裹并转义内部单引号
 */
function quoteIfNeeded(s: string): string {
  if (s === '') return "''"
  // 需要加引号的场景：含冒号+空格、#、引号、前后空格、看起来像数字（避免被解析为 number）
  const needsQuote = /^[\s]|[\s]$/.test(s) ||
    /[:#]/.test(s) ||
    /['"]/.test(s) ||
    /^\d/.test(s) ||
    /^(true|false|null|yes|no|on|off)$/i.test(s) ||
    /\n/.test(s)
  if (!needsQuote) return s
  // 单引号字符串中，单引号用两个单引号转义
  return `'${s.replace(/'/g, "''")}'`
}

/* ============================================================================
 * 题目目录名生成
 * ========================================================================== */

/**
 * 生成题目目录名：直接使用题号（v2 稳定 PID）
 */
function makeProblemDirName(problem: {
  problemNumber: string | null
  id: string
}): string {
  return makePackDirName(problem.problemNumber, problem.id)
}

/* ============================================================================
 * 单题导出
 * ========================================================================== */

/**
 * 将单个题目序列化为 DSOJ 标准格式的文件列表
 *   返回形如 [{ path: "problems/LP1001/problem.yaml", content: "..." }] 的列表
 *
 * 注意：本函数为同步纯函数，调用方负责按批次加载题目后逐题调用。
 */
function serializeOneProblem(
  problem: ExportProblem,
  options: DsojExportOptions
): Array<{ path: string; content: Buffer }> {
  const files: Array<{ path: string; content: Buffer }> = []
  const dirName = makeProblemDirName(problem)
  const base = `problems/${dirName}/`
  const luoguPid = deriveLuoguPid(problem.problemNumber)

  // 1. problem.yaml（SPJ 对齐参考题包 LB3758：special_judge + checker）
  const isSpj =
    problem.comparisonMode === 'special-judge' ||
    (typeof problem.spjCode === 'string' && problem.spjCode.trim().length > 0)
  const exportTags = Array.isArray(problem.tags) ? [...problem.tags] : []
  if (
    isSpj &&
    !exportTags.some((t) => String(t).toLowerCase() === 'special judge')
  ) {
    exportTags.push('Special Judge')
  }
  const problemYaml = serializeYaml({
    schema_version: 2,
    title: problem.title,
    problem_number: problem.problemNumber || undefined,
    luogu_pid: luoguPid,
    difficulty: problem.difficulty,
    tags: exportTags,
    source: problem.source || undefined,
    visibility: problem.visibility,
    time_limit: problem.timeLimit,
    memory_limit: problem.memoryLimit,
    // 题包约定用下划线 special_judge；库内仍为 special-judge
    comparison_mode: isSpj ? 'special_judge' : problem.comparisonMode || 'default',
    real_precision: problem.realPrecision,
    ...(isSpj ? { checker: 'checker.cpp' } : {}),
  })
  files.push({
    path: base + 'problem.yaml',
    content: Buffer.from(problemYaml, 'utf-8'),
  })

  // 2. description.md（必需）
  files.push({
    path: base + 'description.md',
    content: Buffer.from(problem.description || '', 'utf-8'),
  })

  // 2.5 background.md（可选，题目背景 markdown）
  if (problem.background && problem.background.trim()) {
    files.push({
      path: base + 'background.md',
      content: Buffer.from(problem.background, 'utf-8'),
    })
  }

  // 3. input.md / output.md（非空才导出）
  if (problem.input && problem.input.trim()) {
    files.push({
      path: base + 'input.md',
      content: Buffer.from(problem.input, 'utf-8'),
    })
  }
  if (problem.output && problem.output.trim()) {
    files.push({
      path: base + 'output.md',
      content: Buffer.from(problem.output, 'utf-8'),
    })
  }
  if (problem.hint && problem.hint.trim()) {
    files.push({
      path: base + 'hint.md',
      content: Buffer.from(problem.hint, 'utf-8'),
    })
  }

  // 4. samples/（展示样例，从 problem.samples 字段导出）
  if (Array.isArray(problem.samples)) {
    ;(problem.samples as ExportSample[]).forEach((sample, idx) => {
      if (!sample || typeof sample !== 'object') return
      const num = idx + 1
      if (typeof sample.input === 'string') {
        files.push({
          path: `${base}samples/${num}.in`,
          content: Buffer.from(sample.input, 'utf-8'),
        })
      }
      if (typeof sample.output === 'string') {
        files.push({
          path: `${base}samples/${num}.out`,
          content: Buffer.from(sample.output, 'utf-8'),
        })
      }
    })
  }

  // 5. testcases/（完整测试点，从 TestCase 表导出）
  if (options.includeTestCases !== false && Array.isArray(problem.testCases)) {
    problem.testCases.forEach((tc, idx) => {
      const num = idx + 1
      if (typeof tc.input === 'string') {
        files.push({
          path: `${base}testcases/${num}.in`,
          content: Buffer.from(tc.input, 'utf-8'),
        })
      }
      if (typeof tc.output === 'string') {
        files.push({
          path: `${base}testcases/${num}.out`,
          content: Buffer.from(tc.output, 'utf-8'),
        })
      }
      // 单测点分数（仅当存在且不为 0/100 默认值时导出）
      if (typeof tc.score === 'number' && tc.score > 0 && tc.score < 100) {
        files.push({
          path: `${base}testcases/${num}.score`,
          content: Buffer.from(String(tc.score), 'utf-8'),
        })
      }
    })
  }

  // 6. std.cpp / std.c / std.py（标程，按 problem.stdLang 字段决定扩展名）
  //    项目 Problem.stdLang 支持 cpp / c / python，对齐 lib/judge/compiler.ts
  if (options.includeStdCode !== false && problem.stdCode) {
    let ext = '.cpp'
    const lang = String(problem.stdLang || '').toLowerCase()
    if (lang === 'c') {
      ext = '.c'
    } else if (lang === 'python' || lang === 'py') {
      ext = '.py'
    } else {
      // 默认 cpp（lang 为空或未知时）
      ext = '.cpp'
    }
    files.push({
      path: base + 'std' + ext,
      content: Buffer.from(problem.stdCode, 'utf-8'),
    })
  }

  // 6.5 Special Judge（checker.cpp，对齐洛谷命名）
  if (problem.spjCode && String(problem.spjCode).trim()) {
    files.push({
      path: base + 'checker.cpp',
      content: Buffer.from(String(problem.spjCode), 'utf-8'),
    })
  }

  // 7. solutions/（v2：index.json 无 author；md 仅标题+正文）
  if (options.includeSolutions !== false && Array.isArray(problem.solutions)) {
    const solutionItems: Array<{
      lid: string
      title: string
      thumb_up: number
      file: string
    }> = []

    problem.solutions.forEach((sol, idx) => {
      if (!sol || typeof sol.content !== 'string' || !sol.content.trim()) return
      const lid = String(sol.id || `s${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || `s${idx + 1}`
      const fileName = `${lid}.md`
      const title = String(sol.title || `题解 ${idx + 1}`).trim() || `题解 ${idx + 1}`
      // 站内无点赞字段时，用浏览量近似 thumb_up（仅供索引排序）
      const thumbUp = typeof sol.views === 'number' ? sol.views : 0
      const trimmed = sol.content.trim()
      const body = trimmed.startsWith('#')
        ? `${trimmed}\n`
        : `# ${title}\n\n${trimmed}\n`

      files.push({
        path: `${base}solutions/${fileName}`,
        content: Buffer.from(body, 'utf-8'),
      })
      solutionItems.push({
        lid,
        title,
        thumb_up: thumbUp,
        file: fileName,
      })
    })

    if (solutionItems.length > 0) {
      files.push({
        path: `${base}solutions/index.json`,
        content: Buffer.from(
          JSON.stringify({ count: solutionItems.length, solutions: solutionItems }, null, 2) + '\n',
          'utf-8'
        ),
      })
    }
  }

  return files
}

/* ============================================================================
 * 主入口：流式导出
 * ========================================================================== */

/**
 * 流式导出题目为 DSOJ 标准题包
 *
 * 通过 DsojArchiveWriter 抽象统一 zip / tar.xz 两种后端。
 *
 * 处理顺序：
 *   1. 写入 pack.yaml（包元信息）
 *   2. 写入 README.md（格式说明）
 *   3. 分批查询题目，逐题写入归档
 *   4. 写入 index.json（v2 权威索引，需等所有题目处理完才能汇总）
 *   5. 调用 writer.finalize() 关闭归档
 *
 * @param options 导出选项
 * @param writer 归档写入器（zip 或 tar.xz）
 * @param onProgress 可选进度回调
 * @returns 导出统计（成功/失败/总题数）
 */
export async function exportDsojPackStream(
  options: DsojExportOptions,
  writer: DsojArchiveWriter,
  onProgress?: (progress: DsojExportProgress) => void
): Promise<{ success: number; failed: number; total: number }> {
  const ids = options.problemIds ?? []
  const batchSize = Math.max(1, Math.min(200, options.batchSize ?? DEFAULT_BATCH_SIZE))

  if (ids.length === 0) {
    throw new Error('未指定导出题目（problemIds 为空）')
  }

  logger.info('开始流式导出 DSOJ 题包', {
    problemCount: ids.length,
    batchSize,
    packSource: options.packSource,
  })

  // 1. 写入 pack.yaml（先占位写入题数，最后可由 index.json 权威统计）
  //    注意：stream 模式下无法回填，故 pack.yaml 的 problem_count 用 ids.length（请求量）
  //    实际成功题数以 index.json 为准
  const packYaml = serializeYaml({
    format: DSOJ_PACK_FORMAT_ID,
    version: DSOJ_PACK_VERSION,
    created_at: new Date().toISOString(),
    source: options.packSource || 'DSOJ',
    description: options.description || `DSOJ 标准题包，共 ${ids.length} 题`,
    problem_count: ids.length,
    index: 'index.json',
  })
  await writer.append(Buffer.from(packYaml, 'utf-8'), 'pack.yaml')

  // 2. 写入 README.md（格式说明，便于用户理解）
  const readme = `# DSOJ 标准题包

格式: ${DSOJ_PACK_FORMAT_ID} v${DSOJ_PACK_VERSION}
题目数: ${ids.length}
创建时间: ${new Date().toISOString()}

## 目录结构

\`\`\`
dsoj-pack.{zip|tar.xz}
├── pack.yaml              # 包元信息
├── index.json             # 题目索引（权威列表）
├── README.md              # 本说明文件
└── problems/
    ├── <题号>/               # 如 P1001 / LP1001
    │   ├── problem.yaml   # 题目元信息
    │   ├── description.md # 题目描述
    │   ├── background.md  # 题目背景（可选）
    │   ├── input.md       # 输入格式（可选）
    │   ├── output.md      # 输出格式（可选）
    │   ├── hint.md        # 提示（可选）
    │   ├── samples/       # 展示样例
    │   ├── testcases/     # 完整测试点
    │   ├── solutions/     # 可选题解
    │   ├── config.yaml    # 测试配置覆盖（可选）
    │   └── std.cpp        # 标准代码（可选）
    └── ...
\`\`\`

## 导入方法

通过管理后台 → 题库管理 → 批量导入 → 选择「DSOJ」格式上传此题包文件。
支持 ZIP 与 tar.xz 两种归档格式。
`
  await writer.append(Buffer.from(readme, 'utf-8'), 'README.md')

  // 3. 分批查询 + 逐题写入归档
  let successCount = 0
  let failedCount = 0
  const usedDirNames = new Set<string>()
  const indexProblems: Array<{
    order: number
    pid: string
    luogu_pid?: string
    dir: string
    title: string
    difficulty: string
    tags: string[]
  }> = []

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    const problems = await loadProblemBatch(chunk)

    for (const problem of problems) {
      try {
        const files = serializeOneProblem(problem, options)
        // 处理目录名冲突（同一题号前缀但 slug 不同时可能冲突）
        let baseDir = files[0].path.split('/')[1] // problems/<dirName>/...
        let attempt = 0
        while (usedDirNames.has(baseDir)) {
          attempt++
          // 在 dirName 后加 -2、-3 等
          const original = baseDir
          baseDir = `${original}-${attempt}`
        }
        usedDirNames.add(baseDir)

        // 如果改了目录名，需要重写所有文件路径
        if (attempt > 0) {
          for (const f of files) {
            const parts = f.path.split('/')
            parts[1] = baseDir
            f.path = parts.join('/')
          }
        }

        for (const f of files) {
          await writer.append(f.content, f.path)
        }
        const pid = problem.problemNumber || baseDir
        const luoguPid = deriveLuoguPid(pid)
        indexProblems.push({
          order: indexProblems.length + 1,
          pid,
          ...(luoguPid ? { luogu_pid: luoguPid } : {}),
          dir: baseDir,
          title: problem.title,
          difficulty: problem.difficulty || '入门',
          tags: Array.isArray(problem.tags) ? problem.tags : [],
        })
        successCount++
      } catch (err: unknown) {
        failedCount++
        logger.warn('单题导出失败', {
          problemId: problem.id,
          title: problem.title,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      // 推送进度
      onProgress?.({
        processed: successCount + failedCount,
        success: successCount,
        failed: failedCount,
        total: ids.length,
        currentTitle: problem.title,
      })
    }
  }

  // 4. 写入 index.json（v2 权威索引，需等所有题目处理完才能汇总）
  await writer.append(
    Buffer.from(
      JSON.stringify(
        {
          schema_version: 2,
          problem_count: indexProblems.length,
          problems: indexProblems,
        },
        null,
        2
      ) + '\n',
      'utf-8'
    ),
    'index.json'
  )

  if (successCount === 0) {
    throw new Error(`所有题目导出失败（共 ${failedCount} 题）`)
  }

  logger.info('DSOJ 题包流式导出完成', {
    success: successCount,
    failed: failedCount,
    total: ids.length,
  })

  // 5. 关闭归档
  await writer.finalize()

  return { success: successCount, failed: failedCount, total: ids.length }
}

/**
 * 创建 ZIP 归档写入器（兼容旧调用方）
 *
 * 注意：返回 writer.output 作为 Response body。
 * 推荐使用 createDsojArchiveWriter(format) 工厂函数。
 */
export function createDsojArchiver(): DsojArchiveWriter & { output: PassThrough } {
  return new ZipArchiveWriter()
}

/** 当前格式版本（供调用方展示） */
export const EXPORT_PACK_VERSION = DSOJ_PACK_VERSION

/** 格式标识 */
export const EXPORT_PACK_FORMAT_ID = DSOJ_PACK_FORMAT_ID
