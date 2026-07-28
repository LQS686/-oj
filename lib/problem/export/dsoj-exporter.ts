/**
 * lib/problem/export/dsoj-exporter.ts
 * DSOJ 标准题包导出器（与 dsoj-parser 配套使用）
 *
 * 将数据库中的题目导出为 DSOJ 标准格式 ZIP 包（v2），
 * 可由 dsoj-parser 重新导入，实现完整的导出 → 导入闭环。
 *
 * 导出格式：
 *   dsoj-pack.zip
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
 */
import AdmZip from 'adm-zip'
import { prisma } from '@/lib/prisma'
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
}

/** 当前格式版本 */
const DSOJ_PACK_VERSION = '2.0'
const DSOJ_PACK_FORMAT_ID = 'dsoj-pack'

/* ============================================================================
 * 题目数据加载
 * ========================================================================== */

/**
 * 从数据库加载完整题目数据（含测试用例、标程）
 */
async function loadProblemsForExport(options: DsojExportOptions) {
  const where: any = {}
  if (options.problemIds && options.problemIds.length > 0) {
    where.id = { in: options.problemIds }
  }

  const problems = await prisma.problem.findMany({
    where,
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
    orderBy: { createdAt: 'asc' },
  })

  // 指定 ids 时按入参顺序导出（与后台勾选顺序一致）
  if (options.problemIds && options.problemIds.length > 0) {
    const order = new Map(options.problemIds.map((id, i) => [id, i]))
    problems.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  return problems
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
 */
function serializeOneProblem(
  problem: any,
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
    problem.samples.forEach((sample: any, idx: number) => {
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
    problem.testCases.forEach((tc: any, idx: number) => {
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

    problem.solutions.forEach((sol: any, idx: number) => {
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
 * 主入口
 * ========================================================================== */

/**
 * 导出题目为 DSOJ 标准题包 ZIP
 *
 * @param options 导出选项
 * @returns ZIP 文件的 Buffer
 */
export async function exportDsojPack(options: DsojExportOptions): Promise<Buffer> {
  logger.info('开始导出 DSOJ 题包', {
    problemIds: options.problemIds?.length,
    packSource: options.packSource,
  })

  // 1. 加载题目数据
  const problems = await loadProblemsForExport(options)
  if (problems.length === 0) {
    throw new Error('未找到符合条件的题目')
  }

  // 2. 创建 ZIP
  const zip = new AdmZip()

  // 3. 写入 pack.yaml（包元信息）
  const packYaml = serializeYaml({
    format: DSOJ_PACK_FORMAT_ID,
    version: DSOJ_PACK_VERSION,
    created_at: new Date().toISOString(),
    source: options.packSource || 'DSOJ',
    description: options.description || `DSOJ 标准题包，共 ${problems.length} 题`,
    problem_count: problems.length,
    index: 'index.json',
  })
  zip.addFile('pack.yaml', Buffer.from(packYaml, 'utf-8'))

  // 4. 写入 README.md（格式说明，便于用户理解）
  const readme = `# DSOJ 标准题包

格式: ${DSOJ_PACK_FORMAT_ID} v${DSOJ_PACK_VERSION}
题目数: ${problems.length}
创建时间: ${new Date().toISOString()}

## 目录结构

\`\`\`
dsoj-pack.zip
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

通过管理后台 → 题库管理 → 批量导入 → 选择「DSOJ」格式上传此 ZIP 包。
`
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'))

  // 5. 逐题序列化并写入 ZIP
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
        zip.addFile(f.path, f.content)
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
    } catch (err: any) {
      failedCount++
      logger.warn('单题导出失败', {
        problemId: problem.id,
        title: problem.title,
        error: err?.message,
      })
    }
  }

  // 6. 写入 index.json（v2 权威索引）
  zip.addFile(
    'index.json',
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
    )
  )

  if (successCount === 0) {
    throw new Error(`所有题目导出失败（共 ${failedCount} 题）`)
  }

  logger.info('DSOJ 题包导出完成', {
    success: successCount,
    failed: failedCount,
    total: problems.length,
  })

  // 7. 返回 ZIP buffer
  return zip.toBuffer()
}

/** 当前格式版本（供调用方展示） */
export const EXPORT_PACK_VERSION = DSOJ_PACK_VERSION

/** 格式标识 */
export const EXPORT_PACK_FORMAT_ID = DSOJ_PACK_FORMAT_ID
