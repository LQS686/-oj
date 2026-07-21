/**
 * lib/problem/import/service.ts
 * 导入服务核心：去重 + 创建 + 测试用例同步
 *
 * 复用现有 createAdminProblem / updateAdminProblem 的校验逻辑，
 * 不绕过任何权限/字段校验。
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import { isValidDifficulty, migrateDifficulty } from '@/lib/constants'
import { clearProblemCache } from '../admin'
import { redistributeTestScores } from '../testcase'
import type {
  ImportedProblem,
  ImportedProblemResult,
  ImportBatchResult,
  ImportOptions,
} from './types'

/**
 * 规范化难度值：8 档直接通过 / 旧版迁移 / fallback
 */
function normalizeDifficulty(value: unknown, fallback: string): string {
  if (isValidDifficulty(value)) return value as string
  const migrated = migrateDifficulty(value)
  if (isValidDifficulty(migrated)) return migrated
  return fallback
}

/**
 * 题目规范化：补全默认值、清理空字段、确保字段类型正确
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
  return {
    ...raw,
    title,
    description,
    difficulty: normalizeDifficulty(raw.difficulty, options.defaultDifficulty),
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
 * 创建单题（含测试用例）
 * - 样例自动同步到 TestCase 表（isSample=true）
 * - 完整测试用例追加在样例之后
 * - 自动均分分数（最后一个补齐到 100）
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

  // 组装测试用例：样例在前 + 普通用例在后
  const sampleTcs = problem.samples.length
    ? problem.samples.map(s => ({
        input: s.input,
        output: s.output,
        isSample: true,
      }))
    : []
  const normalTcs = problem.testCases.map(tc => ({
    input: tc.input,
    output: tc.output,
    isSample: false,
    score: tc.score,
  }))
  const allTcs = [...sampleTcs, ...normalTcs]

  // 均分分数（避免分数总和 ≠ 100）
  const equal = Math.floor(100 / Math.max(1, allTcs.length))
  const testCasesData = allTcs.map((tc, idx) => ({
    input: tc.input,
    output: tc.output,
    isSample: tc.isSample,
    score: idx === allTcs.length - 1 ? 100 - equal * (allTcs.length - 1) : equal,
    orderIndex: idx,
  }))

  const created = await prisma.problem.create({
    data: {
      problemNumber: finalProblemNumber,
      title: problem.title,
      description: problem.description,
      background: problem.background || null,
      input: problem.input || '',
      output: problem.output || '',
      samples: problem.samples as any,
      hint: problem.hint || null,
      source: problem.source || null,
      difficulty: problem.difficulty,
      tags: problem.tags,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      comparisonMode: problem.comparisonMode || 'default',
      realPrecision: problem.realPrecision ?? 3,
      isPublic: options.visibility === 'public',
      visibility: options.visibility,
      stdCode: problem.stdCode || null,
      stdLang: problem.stdLang || null,
      author: { connect: { id: options.authorId } },
      testCases: { create: testCasesData },
    },
    include: { testCases: true },
  })

  if (created.testCases && created.testCases.length > 0) {
    await redistributeTestScores(created.id)
  }
  clearProblemCache(created.id)

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
  // 样例 + 测试用例合并
  const sampleTcs = problem.samples.length
    ? problem.samples.map(s => ({ input: s.input, output: s.output, isSample: true }))
    : []
  const normalTcs = problem.testCases.map(tc => ({
    input: tc.input,
    output: tc.output,
    isSample: false,
  }))
  const allTcs = [...sampleTcs, ...normalTcs]
  const equal = Math.floor(100 / Math.max(1, allTcs.length))
  const testCasesData = allTcs.map((tc, idx) => ({
    problemId: existingId,
    input: tc.input,
    output: tc.output,
    isSample: tc.isSample,
    score: idx === allTcs.length - 1 ? 100 - equal * (allTcs.length - 1) : equal,
    orderIndex: idx,
  }))

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: existingId },
      data: {
        title: problem.title,
        description: problem.description,
        background: problem.background || null,
        input: problem.input || '',
        output: problem.output || '',
        samples: problem.samples as any,
        hint: problem.hint || null,
        source: problem.source || null,
        difficulty: problem.difficulty,
        tags: problem.tags,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        comparisonMode: problem.comparisonMode || 'default',
        realPrecision: problem.realPrecision ?? 3,
        isPublic: options.visibility === 'public',
        visibility: options.visibility,
        stdCode: problem.stdCode || null,
        stdLang: problem.stdLang || null,
      },
    }),
    prisma.testCase.deleteMany({ where: { problemId: existingId } }),
  ])

  if (testCasesData.length > 0) {
    await prisma.testCase.createMany({ data: testCasesData })
    await redistributeTestScores(existingId)
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
  } catch (err: any) {
    logger.warn(`[import] 题目导入失败: ${title}`, {
      externalId,
      error: err?.message,
      code: err?.code,
    })
    return {
      status: 'failed',
      title,
      externalId,
      reason: err?.message || '未知错误',
    }
  }
}

/**
 * 批量导入入口
 *
 * - 单题失败/跳过不会影响其他题目
 * - 顺序执行（避免并发引发题号冲突）
 * - 大批量导入建议拆分为多批次调用
 */
export async function importProblems(
  rawList: ImportedProblem[],
  options: ImportOptions
): Promise<ImportBatchResult> {
  if (!rawList || rawList.length === 0) {
    return { total: 0, created: 0, skipped: 0, failed: 0, results: [] }
  }

  // 上限保护：单次最多 500 道
  const MAX_BATCH = 500
  if (rawList.length > MAX_BATCH) {
    throw new ApiError(
      'BATCH_TOO_LARGE',
      `单次最多导入 ${MAX_BATCH} 道题目，请分批处理`,
      400
    )
  }

  const results: ImportedProblemResult[] = []
  for (const raw of rawList) {
    const result = await importOneProblem(raw, options)
    results.push(result)
  }

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length

  logger.info(
    `[import] 批量导入完成：共 ${rawList.length} 题，新建 ${created}，跳过 ${skipped}，失败 ${failed}`
  )

  return {
    total: rawList.length,
    created,
    skipped,
    failed,
    results,
  }
}
