/**
 * lib/problem/import/service.ts
 * 导入服务核心：去重 + 创建 + 测试用例同步
 *
 * 复用现有 createAdminProblem / updateAdminProblem 的校验逻辑，
 * 不绕过任何权限/字段校验。
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/errors'
import { isValidDifficulty, normalizeDifficulty, type Difficulty } from '@/lib/constants'
import { clearProblemCache } from '../admin'
import { redistributeTestScores } from '../testcase'
import { invalidateProblemTestCaseCache } from '@/lib/judge/testcase-loader'
import type {
  ImportedProblem,
  ImportedProblemResult,
  ImportOptions,
} from './types'

/**
 * 题目规范化：补全默认值、清理空字段、确保字段类型正确。
 * 难度仅接受洛谷 8 档；缺省用 options.defaultDifficulty；显式非法值直接报错（不做旧档映射）。
 */
function normalizeImportedProblem(
  raw: ImportedProblem,
  options: ImportOptions
): ImportedProblem {
  const title = (raw.title || '').trim()
  if (!title) {
    throw new Error('题目标题为空')
  }
  if (title.length > 200) {
    throw new Error(`题目标题过长（${title.length} > 200）`)
  }
  const description = (raw.description || '').trim()
  if (description.length < 10) {
    throw new Error('题目描述至少需要 10 个字符')
  }

  let difficulty: Difficulty
  const rawDifficulty = raw.difficulty
  if (rawDifficulty == null || String(rawDifficulty).trim() === '') {
    difficulty = normalizeDifficulty(options.defaultDifficulty)
  } else if (isValidDifficulty(rawDifficulty)) {
    difficulty = rawDifficulty
  } else {
    throw new Error(
      `非法难度「${String(rawDifficulty)}」，须为洛谷 8 档之一：入门 / 普及- / 普及 / 普及+ / 提高 / 提高+ / 省选 / NOI`
    )
  }

  return {
    ...raw,
    title,
    description,
    difficulty,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean).map(t => String(t).trim()) : [],
    timeLimit: Number.isFinite(raw.timeLimit) && raw.timeLimit > 0 ? raw.timeLimit : 1000,
    memoryLimit: Number.isFinite(raw.memoryLimit) && raw.memoryLimit > 0 ? raw.memoryLimit : 128,
    samples: Array.isArray(raw.samples) ? raw.samples : [],
    testCases: Array.isArray(raw.testCases) ? raw.testCases : [],
    background: raw.background?.trim() || undefined,
    hint: raw.hint || undefined,
    source: raw.source || undefined,
    stdCode: raw.stdCode || undefined,
    stdLang: raw.stdLang || (raw.stdCode ? 'cpp' : undefined),
  }
}

/**
 * 检查重名：按 title 查找已有题目
 * - 返回 null 表示无重名
 */
async function findExistingByTitle(title: string) {
  return prisma.problem.findFirst({
    where: { title },
    select: { id: true, problemNumber: true, title: true },
  })
}

/**
 * 检查题号冲突：按 problemNumber 查找已有题目
 * - 返回 null 表示无冲突
 */
async function findExistingByProblemNumber(problemNumber: string) {
  return prisma.problem.findUnique({
    where: { problemNumber },
    select: { id: true, problemNumber: true, title: true },
  })
}

/**
 * 自动分配题号：P1001 起步，遇到已占用则递增
 */
async function generateNextProblemNumber(): Promise<string> {
  const latest = await prisma.problem.findFirst({
    where: { problemNumber: { startsWith: 'P' } },
    orderBy: { problemNumber: 'desc' },
    select: { problemNumber: true },
  })
  let next = 1001
  if (latest?.problemNumber) {
    const m = latest.problemNumber.match(/^P(\d+)$/)
    if (m) next = parseInt(m[1], 10) + 1
  }
  return `P${next}`
}

/**
 * 组装正式评测点分数：若每点都带合法 score 且总和为 100 则保留；否则均分 100
 */
function buildTestCasesData(
  problem: ImportedProblem
): { rows: Array<{ input: string; output: string; isSample: false; score: number; orderIndex: number }>; customScores: boolean } {
  const normalTcs = problem.testCases.map((tc) => ({
    input: tc.input,
    output: tc.output,
    score: tc.score,
  }))
  const allCustom = normalTcs.every(
    (tc) => typeof tc.score === 'number' && Number.isFinite(tc.score) && tc.score > 0
  )
  const customSum = allCustom
    ? normalTcs.reduce((sum, tc) => sum + (tc.score as number), 0)
    : 0
  if (allCustom && normalTcs.length > 0 && customSum === 100) {
    return {
      customScores: true,
      rows: normalTcs.map((tc, idx) => ({
        input: tc.input,
        output: tc.output,
        isSample: false as const,
        score: tc.score as number,
        orderIndex: idx,
      })),
    }
  }
  const equal = Math.floor(100 / Math.max(1, normalTcs.length))
  return {
    customScores: false,
    rows: normalTcs.map((tc, idx) => ({
      input: tc.input,
      output: tc.output,
      isSample: false as const,
      score: idx === normalTcs.length - 1 ? 100 - equal * (normalTcs.length - 1) : equal,
      orderIndex: idx,
    })),
  }
}

/**
 * 逐条创建测试用例，避免 createMany 单事务过大触发 WiredTiger 缓存限制。
 * 深基/NOIP 等大测试用例单条输入输出可达数百 KB，
 * 多条合并进一个事务会超 `transaction is too large` 限制。
 * 逐条 create 每条是独立事务，不会超限。
 */
async function createTestCasesIndividually(
  problemId: string,
  rows: Array<{ input: string; output: string; isSample: false; score: number; orderIndex: number }>
) {
  for (const tc of rows) {
    await prisma.testCase.create({
      data: { ...tc, problemId },
    })
  }
}

async function importSolutions(
  problemId: string,
  solutions: NonNullable<ImportedProblem['solutions']>,
  authorId: string
) {
  // 题包题解由管理员导入，为可信内容，直接设为 approved 可见，
  // 不需要走 pending 审核（与普通用户提交题解不同）。
  // 同样逐条 create 避免 createMany 事务超限。
  for (const s of solutions) {
    await prisma.solution.create({
      data: {
        problemId,
        authorId,
        title: (s.title || '题解').slice(0, 200),
        content:
          s.authorName && !s.content.startsWith('> ')
            ? `> 原作者：${s.authorName}\n\n${s.content}`
            : s.content,
        isOfficial: false,
        sourceType: 'USER',
        status: 'approved',
      },
    })
  }
}

/**
 * 创建单题（含测试用例）
 * - samples/ → Problem.samples（题面展示，不进入评测）
 * - testcases/ → TestCase 表（正式评测点，isSample=false）
 * - solutions/ → Solution 表（可选）
 *
 * 注意：题目与测试用例分两次写入，不使用嵌套 create。
 * 嵌套 create 会把「题目 + 全部测试用例」放进同一个 WiredTiger 事务，
 * 大测试用例（如深基系列输入输出各数百 KB）会使事务超过引擎缓存限制，
 * 报错 `transaction is too large and will not fit in the storage engine cache`。
 */
async function createOne(
  problem: ImportedProblem,
  options: ImportOptions
): Promise<{ id: string; problemNumber: string }> {
  const finalProblemNumber = problem.problemNumber
    ? problem.problemNumber
    : await generateNextProblemNumber()

  // 检查题号冲突
  if (problem.problemNumber) {
    const conflict = await prisma.problem.findUnique({
      where: { problemNumber: problem.problemNumber },
      select: { id: true },
    })
    if (conflict) {
      throw new ApiError('DUPLICATE_NUMBER', `题号 ${problem.problemNumber} 已存在`, 400)
    }
  }

  const visibility = problem.visibility ?? options.visibility
  const { rows: testCasesData, customScores } = buildTestCasesData(problem)

  // 第一步：仅创建题目（不含测试用例），事务体小，不会触发缓存限制
  const created = await prisma.problem.create({
    data: {
      problemNumber: finalProblemNumber,
      title: problem.title,
      description: problem.description,
      background: problem.background || null,
      input: problem.input || '',
      output: problem.output || '',
      samples: problem.samples as unknown as Prisma.InputJsonValue,
      hint: problem.hint || null,
      source: problem.source || null,
      difficulty: problem.difficulty,
      tags: problem.tags,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: problem.comparisonMode || 'default',
      realPrecision: problem.realPrecision ?? 3,
      isPublic: visibility === 'public',
      visibility,
      stdCode: problem.stdCode || null,
      stdLang: problem.stdLang || null,
      spjCode: problem.spjCode || null,
      author: { connect: { id: options.authorId } },
    },
    select: { id: true, problemNumber: true },
  })

  // 第二步：逐条创建测试用例（每条独立事务，避免 WiredTiger 缓存超限）
  if (testCasesData.length > 0) {
    await createTestCasesIndividually(created.id, testCasesData)
    if (!customScores) {
      await redistributeTestScores(created.id)
    }
  }
  clearProblemCache(created.id)

  // 导入附带题解（失败不回滚题目）
  if (problem.solutions && problem.solutions.length > 0) {
    try {
      await importSolutions(created.id, problem.solutions, options.authorId)
    } catch (err) {
      logger.warn('导入题解失败（题目已创建）', {
        problemId: created.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { id: created.id, problemNumber: created.problemNumber! }
}

/**
 * 覆盖单题（保留 problemNumber + id，覆盖其他字段）
 */
async function overwriteOne(
  existingId: string,
  problem: ImportedProblem,
  options: ImportOptions
): Promise<void> {
  const visibility = problem.visibility ?? options.visibility
  const { rows: testCasesData, customScores } = buildTestCasesData(problem)

  await invalidateProblemTestCaseCache(existingId)
  await prisma.$transaction([
    prisma.problem.update({
      where: { id: existingId },
      data: {
        title: problem.title,
        description: problem.description,
        background: problem.background || null,
        input: problem.input || '',
        output: problem.output || '',
        samples: problem.samples as unknown as Prisma.InputJsonValue,
        hint: problem.hint || null,
        source: problem.source || null,
        difficulty: problem.difficulty,
        tags: problem.tags,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        comparisonMode: problem.comparisonMode || 'default',
        realPrecision: problem.realPrecision ?? 3,
        isPublic: visibility === 'public',
        visibility,
        stdCode: problem.stdCode || null,
        stdLang: problem.stdLang || null,
        spjCode: problem.spjCode || null,
      },
    }),
    prisma.testCase.deleteMany({ where: { problemId: existingId } }),
  ])

  if (testCasesData.length > 0) {
    await createTestCasesIndividually(existingId, testCasesData)
    if (!customScores) {
      await redistributeTestScores(existingId)
    }
  }

  // 覆盖导入时同步题解：替换非官方题解，避免旧题解残留
  if (problem.solutions && problem.solutions.length > 0) {
    try {
      await prisma.solution.deleteMany({
        where: { problemId: existingId, isOfficial: false },
      })
      await importSolutions(existingId, problem.solutions, options.authorId)
    } catch (err) {
      logger.warn('覆盖导入题解失败（题目已更新）', {
        problemId: existingId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  clearProblemCache(existingId)
}

/**
 * 比对导入数据与已存在题目是否完全一致（用于 skip 策略的智能判定）。
 *
 * 比对范围：题面包内的所有内容字段（题面、限制、样例、标准代码、SPJ、测试点、题解数量），
 * 不比对 problemNumber / visibility / isPublic（由导入选项或已存在记录决定，非题包内容）。
 *
 * 大测试点处理：
 *   - 题面字段一次性查出（总大小通常几十 KB，可控）；
 *   - 测试点先比对数量，数量一致后**逐条** select input/output 比对，
 *     每次内存中只有一条测试点（避免一次性加载全部大测试点导致内存峰值）；
 *   - 任何字段不一致立即短路返回 false，减少不必要的比对。
 *
 * @returns true=数据一致可跳过 / false=数据不一致需覆盖
 */
async function isProblemDataUnchanged(
  existingId: string,
  imported: ImportedProblem
): Promise<boolean> {
  // 1. 比对题面字段（一次性查出，字段总大小可控）
  const existing = await prisma.problem.findUnique({
    where: { id: existingId },
    select: {
      title: true,
      description: true,
      background: true,
      input: true,
      output: true,
      hint: true,
      source: true,
      difficulty: true,
      tags: true,
      timeLimit: true,
      memoryLimit: true,
      comparisonMode: true,
      realPrecision: true,
      stdCode: true,
      stdLang: true,
      spjCode: true,
      samples: true,
    },
  })
  if (!existing) return false

  // 短路比对各字段（null 与 undefined 统一为空串处理）
  const norm = (v: string | null | undefined): string => v ?? ''
  if (existing.title !== imported.title) return false
  if (existing.description !== imported.description) return false
  if (norm(existing.background) !== norm(imported.background)) return false
  if (norm(existing.input) !== norm(imported.input)) return false
  if (norm(existing.output) !== norm(imported.output)) return false
  if (norm(existing.hint) !== norm(imported.hint)) return false
  if (norm(existing.source) !== norm(imported.source)) return false
  if (existing.difficulty !== imported.difficulty) return false
  if (JSON.stringify(existing.tags ?? []) !== JSON.stringify(imported.tags ?? [])) return false
  if (existing.timeLimit !== imported.timeLimit) return false
  if (existing.memoryLimit !== imported.memoryLimit) return false
  if ((existing.comparisonMode ?? 'default') !== (imported.comparisonMode ?? 'default')) return false
  if ((existing.realPrecision ?? 3) !== (imported.realPrecision ?? 3)) return false
  if (norm(existing.stdCode) !== norm(imported.stdCode)) return false
  if (norm(existing.stdLang) !== norm(imported.stdLang)) return false
  if (norm(existing.spjCode) !== norm(imported.spjCode)) return false
  // samples 是 Json 类型，序列化后比对
  if (JSON.stringify(existing.samples ?? []) !== JSON.stringify(imported.samples ?? [])) return false

  // 2. 比对测试点数量（快速判断，数量不同直接判为不一致）
  const existingTcCount = await prisma.testCase.count({ where: { problemId: existingId } })
  if (existingTcCount !== imported.testCases.length) return false

  // 3. 逐条比对测试点内容（大测试点处理：每次只加载一条，避免内存峰值）
  //    按 orderIndex 顺序比对 input/output，短路返回。
  for (let i = 0; i < imported.testCases.length; i++) {
    const importedTc = imported.testCases[i]
    const dbTc = await prisma.testCase.findFirst({
      where: { problemId: existingId, orderIndex: i },
      select: { input: true, output: true },
    })
    if (!dbTc) return false
    if (dbTc.input !== importedTc.input) return false
    if (dbTc.output !== importedTc.output) return false
  }

  // 4. 比对题解数量（仅当导入数据含题解时；不比对内容，题解可能很大）
  //    若之前题解未导入成功（数量为 0），此处判定不一致 → 触发覆盖补齐题解。
  if (imported.solutions && imported.solutions.length > 0) {
    const existingSolCount = await prisma.solution.count({
      where: { problemId: existingId, isOfficial: false },
    })
    if (existingSolCount !== imported.solutions.length) return false
  }

  return true
}

/**
 * 导入单题（带去重 + 错误隔离）
 */
export async function importOneProblem(
  raw: ImportedProblem,
  options: ImportOptions
): Promise<ImportedProblemResult> {
  const title = (raw.title || '').trim()
  const externalId = raw.externalId

  try {
    const problem = normalizeImportedProblem(raw, options)

    // 去重检查（duplicate 策略跳过此检查，允许完全重复创建）
    if (options.onDuplicate !== 'duplicate') {
      // 同时按 problemNumber 和 title 检查，任一命中即按策略处理
      // 优先 problemNumber（唯一键），其次 title
      const existingByNumber = problem.problemNumber
        ? await findExistingByProblemNumber(problem.problemNumber)
        : null

      // 题号冲突时，必须比对题目名称：
      //   - 名称一致 → 同一题目重复导入，按 onDuplicate 策略处理（skip/overwrite）
      //   - 名称不一致 → 极可能是不同题目但题号冲突（如不同来源都用了 P1001），
      //     直接 skip 会误判为重复，直接 overwrite 会丢失原题数据，都不可接受。
      //     标记为 failed，提示用户手动确认后处理（重命名题号或删除旧题）。
      if (existingByNumber) {
        const existingTitle = (existingByNumber.title || '').trim()
        const importedTitle = (problem.title || '').trim()
        if (existingTitle !== importedTitle) {
          return {
            status: 'failed',
            title: importedTitle,
            externalId,
            reason:
              `题号 ${existingByNumber.problemNumber} 已存在但题目名称不一致，` +
              `请确认是否为同一题目（已有: "${existingTitle}"，导入: "${importedTitle}"）`,
          }
        }
      }

      const existing = existingByNumber ?? (await findExistingByTitle(problem.title))

      if (existing) {
        // 构造清晰的"已存在"原因
        const reason = existingByNumber
          ? `题号 ${existingByNumber.problemNumber} 已存在`
          : `已存在同名题目（${existing.problemNumber}）`

        if (options.onDuplicate === 'skip') {
          // 智能 skip：比对数据一致性。
          //   - 数据一致 → 真正跳过（避免无谓的覆盖写入）
          //   - 数据不一致 → 降级为覆盖（题包有更新，需同步到数据库）
          // 这样修复「题包更新后因题号相同被跳过、新数据/题解未同步」的问题。
          const unchanged = await isProblemDataUnchanged(existing.id, problem)
          if (unchanged) {
            return {
              status: 'skipped',
              title: problem.title,
              externalId,
              reason,
            }
          }
          // 数据不一致：降级为覆盖，保留原 id 和 problemNumber
          logger.info('[import] 数据不一致，skip 降级为覆盖', {
            problemId: existing.id,
            problemNumber: existing.problemNumber,
          })
          await overwriteOne(existing.id, problem, options)
          return {
            status: 'created',
            problemId: existing.id,
            problemNumber: existing.problemNumber || undefined,
            title: problem.title,
            externalId,
            reason: '数据已更新，覆盖已有题目',
          }
        }
        // overwrite：保留原 id 和 problemNumber，覆盖其他字段
        await overwriteOne(existing.id, problem, options)
        return {
          status: 'created',
          problemId: existing.id,
          problemNumber: existing.problemNumber || undefined,
          title: problem.title,
          externalId,
          reason: '覆盖已有题目',
        }
      }
    }

    const { id, problemNumber } = await createOne(problem, options)
    return {
      status: 'created',
      problemId: id,
      problemNumber,
      title: problem.title,
      externalId,
    }
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string }
    logger.warn(`[import] 题目导入失败: ${title}`, {
      externalId,
      error: e.message,
      code: e.code,
    })
    return {
      status: 'failed',
      title,
      externalId,
      reason: e.message || '未知错误',
    }
  }
}
