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

async function importSolutions(
  problemId: string,
  solutions: NonNullable<ImportedProblem['solutions']>,
  authorId: string
) {
  await prisma.solution.createMany({
    data: solutions.map((s) => ({
      problemId,
      authorId,
      title: (s.title || '题解').slice(0, 200),
      content:
        s.authorName && !s.content.startsWith('> ')
          ? `> 原作者：${s.authorName}\n\n${s.content}`
          : s.content,
      isOfficial: false,
      sourceType: 'USER',
    })),
  })
}

/**
 * 创建单题（含测试用例）
 * - samples/ → Problem.samples（题面展示，不进入评测）
 * - testcases/ → TestCase 表（正式评测点，isSample=false）
 * - solutions/ → Solution 表（可选）
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
      testCases: { create: testCasesData },
    },
    include: { testCases: true },
  })

  if (!customScores && created.testCases && created.testCases.length > 0) {
    await redistributeTestScores(created.id)
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
    await prisma.testCase.createMany({
      data: testCasesData.map((tc) => ({ ...tc, problemId: existingId })),
    })
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
          return {
            status: 'skipped',
            title: problem.title,
            externalId,
            reason,
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
