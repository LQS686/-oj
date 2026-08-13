/**
 * lib/problem/admin.ts
 * 管理员视角：列出全部题目（含隐藏字段）/ 创建题目（含自动编号）/ 编辑/获取/删除题目
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { redistributeTestScores, deleteTestCaseFiles } from '@/lib/problem/testcase'
import { invalidateProblemTestCaseCache } from '@/lib/judge/testcase-loader'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { ApiError } from '@/lib/api/errors'
import { logger } from '@/lib/logger'
import { DIFFICULTIES, isValidDifficulty } from '@/lib/constants'
import { purgeProblemDependents } from '@/lib/problem/purge-dependents'

/* ============================================================================
 * 管理员视角：列出全部题目（含隐藏字段）/ 创建题目（含自动编号）
 * ========================================================================== */

export async function listAllProblemsForAdmin(opts?: {
  page?: number
  pageSize?: number
  q?: string
  tagIds?: string[]
  difficulty?: string[]
  visibility?: string
  sources?: string[]
  completeness?: string
}) {
  // 默认强制分页（page=1&pageSize=20），避免无分页参数时一次性返回全表
  // 对非法分页参数做防御（NaN / 负数 → 回落默认值），避免 Prisma 收到 NaN skip/take
  const page = Number.isFinite(opts?.page)
    ? Math.max(1, Math.floor(opts?.page as number))
    : 1
  const rawPageSize = Number.isFinite(opts?.pageSize) && (opts?.pageSize as number) > 0
    ? Math.floor(opts?.pageSize as number)
    : 20
  const pageSize = Math.min(Math.max(1, rawPageSize), 100)
  const take = pageSize
  const skip = (page - 1) * pageSize

  // q 关键字模糊匹配题号 / 标题 / 来源（不区分大小写，参考 HOJ ProblemMapper.xml）
  // - "P1000" / "1000" / 标题片段 / 来源片段均能匹配
  const q = opts?.q?.trim()
  const tagIds = opts?.tagIds?.filter(Boolean)
  const difficulty = opts?.difficulty?.filter(Boolean)
  const visibility = opts?.visibility
  const sources = opts?.sources?.filter(Boolean)
  const completeness = opts?.completeness

  const where: Prisma.ProblemWhereInput = {}
  if (q) {
    where.OR = [
      { problemNumber: { contains: q, mode: 'insensitive' as const } },
      { title: { contains: q, mode: 'insensitive' as const } },
      { source: { contains: q, mode: 'insensitive' as const } },
    ]
  }
  // 标签过滤：保持原前端 AND 语义（需同时拥有所有选中标签）。
  // Mongo 连接器不支持 hasEvery，用多个 has 条件组合 AND 实现（Mongo 支持数组字段 has 过滤）
  if (tagIds && tagIds.length > 0) {
    const tagConditions: Prisma.ProblemWhereInput[] = tagIds.map(t => ({ tags: { has: t } }))
    const andConditions: Prisma.ProblemWhereInput[] = []
    // q 与标签同时存在时，把 OR（q 条件）移入 AND 首个分支，避免 where 自引用
    if (where.OR) {
      andConditions.push({ OR: where.OR })
      delete where.OR
    }
    where.AND = [...andConditions, ...tagConditions]
  }
  if (difficulty && difficulty.length > 0) {
    where.difficulty = { in: difficulty }
  }
  if (visibility && visibility !== 'all') {
    where.visibility = visibility
  }
  if (sources && sources.length > 0) {
    where.source = { in: sources }
  }
  if (completeness === 'hasStd') {
    where.stdLang = { not: null }
  } else if (completeness === 'noStd') {
    where.stdLang = null
  }

  // ===== 性能关键：MongoDB 连接器下 _count 关联查询是逐条执行（N+1）=====
  // 改为：一次 findMany 取候选 id → 一次 testCase.groupBy 聚合全部测点数，
  // 内存合并 _count / 做 hasTests-noTests 过滤 / 统计"有测试点"数量。
  const candidateIds = (
    await prisma.problem.findMany({ where, select: { id: true } })
  ).map(p => p.id)

  let countMap = new Map<string, number>()
  if (candidateIds.length > 0) {
    const grouped = await prisma.testCase.groupBy({
      by: ['problemId'],
      where: { problemId: { in: candidateIds } },
      _count: { _all: true },
    })
    countMap = new Map(grouped.map(g => [g.problemId, g._count._all]))
  }

  // hasTests / noTests 基于测点计数过滤（Mongo 连接器不支持 relation filter）
  let finalIds = candidateIds
  if (completeness === 'hasTests') {
    finalIds = candidateIds.filter(id => (countMap.get(id) ?? 0) > 0)
  } else if (completeness === 'noTests') {
    finalIds = candidateIds.filter(id => (countMap.get(id) ?? 0) === 0)
  }
  const total = finalIds.length

  // 筛选后的统计（公开/隐藏/竞赛/有标程/有测试点）与标签/来源聚合：
  // 一次 findMany 仅取统计与下拉所需字段，避免逐题查询
  let stats: {
    totalAll: number
    total: number
    public: number
    hidden: number
    contest: number
    hasStd: number
    hasTests: number
  } = {
    totalAll: await prisma.problem.count(),
    total,
    public: 0,
    hidden: 0,
    contest: 0,
    hasStd: 0,
    hasTests: 0,
  }
  let availableTags: string[] = []
  let availableSources: string[] = []
  if (finalIds.length > 0) {
    const statRows = await prisma.problem.findMany({
      where: { id: { in: finalIds } },
      select: {
        id: true,
        visibility: true,
        isPublic: true,
        stdLang: true,
        tags: true,
        source: true,
      },
    })
    let publicCount = 0
    let hiddenCount = 0
    let contestCount = 0
    let hasStdCount = 0
    let hasTestsCount = 0
    const tagSet = new Set<string>()
    const sourceSet = new Set<string>()
    for (const row of statRows) {
      const v = row.visibility || (row.isPublic ? 'public' : 'private')
      if (v === 'public') publicCount++
      else if (v === 'contest') contestCount++
      else hiddenCount++
      if (row.stdLang) hasStdCount++
      if ((countMap.get(row.id) ?? 0) > 0) hasTestsCount++
      for (const t of row.tags) {
        if (t) tagSet.add(t)
      }
      if (row.source && row.source.trim()) sourceSet.add(row.source.trim())
    }
    stats = {
      totalAll: stats.totalAll,
      total,
      public: publicCount,
      hidden: hiddenCount,
      contest: contestCount,
      hasStd: hasStdCount,
      hasTests: hasTestsCount,
    }
    availableTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    availableSources = Array.from(sourceSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }

  const data = await prisma.problem.findMany({
    where: { id: { in: finalIds } },
    skip,
    take,
    orderBy: [{ problemNumber: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      problemNumber: true,
      title: true,
      source: true,
      difficulty: true,
      tags: true,
      isPublic: true,
      visibility: true,
      timeLimit: true,
      memoryLimit: true,
      totalSubmit: true,
      totalAccepted: true,
      createdAt: true,
      updatedAt: true,
      // 题目管理筛选需要：标程存在性（用于"有标程/无标程"筛选维度）
      // 用 stdLang 判断有无标程（非空即有），避免传输 stdCode 源码（可达数 KB）
      stdLang: true,
    },
  })
  // 合并测点数到每行（保持 _count.testCases 响应结构，兼容前端类型）
  const rows = data.map(p => ({
    ...p,
    _count: { testCases: countMap.get(p.id) ?? 0 },
  }))

  return {
    data: rows,
    pagination: {
      page,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
    stats,
    meta: { availableTags, availableSources },
  }
}

/** 校验创建/更新题目时的核心字段（抛出 ApiError 由路由 withApi 捕获） */

export interface CreateAdminProblemInput {
  problemNumber?: string
  title?: string
  description?: string
  input?: string
  output?: string
  samples?: unknown
  hint?: string
  source?: string
  difficulty?: string
  tags?: string[]
  timeLimit?: number | string
  memoryLimit?: number | string
  visibility?: string
  testCases?: unknown[]
  [k: string]: unknown
}

function parseLimit(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    return Number.isFinite(n) ? n : fallback
  }
  if (typeof value === 'number') return value
  return fallback
}

export async function ensureAdminProblemNumber(problemNumber?: string): Promise<string> {
  if (problemNumber) {
    const existing = await prisma.problem.findUnique({ where: { problemNumber } })
    if (existing) {
      throw new ApiError('DUPLICATE_NUMBER', '题目编号已存在', 400)
    }
    return problemNumber
  }
  const latestProblems = await prisma.problem.findMany({
    where: { problemNumber: { startsWith: 'P' } },
    select: { problemNumber: true },
  })
  let nextNumber = 1001
  let maxSeen = 0
  for (const p of latestProblems) {
    if (!p.problemNumber) continue
    const match = p.problemNumber.match(/^P(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxSeen) maxSeen = num
    }
  }
  if (maxSeen > 0) nextNumber = maxSeen + 1
  return `P${nextNumber}`
}

export async function createAdminProblem(
  rawBody: Record<string, unknown>,
  authorId: string
) {
  const body = trimAll(rawBody)
  const {
    problemNumber,
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
    timeLimit,
    memoryLimit,
    comparisonMode,
    realPrecision,
    visibility,
    testCases,
    spjCode: rawSpjCode,
  } = body

  // 必填
  if (!title || !description || !difficulty) {
    throw new ApiError('MISSING_FIELDS', '缺少必填字段（title, description, difficulty）', 400)
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 200) {
    throw new ApiError('INVALID_TITLE', '题目标题长度必须在1-200个字符之间', 400)
  }
  if (typeof description !== 'string' || description.length < 10) {
    throw new ApiError('INVALID_DESCRIPTION', '题目描述至少需要10个字符', 400)
  }
  // 难度校验：仅接受洛谷 8 档标准（lib/constants.ts）
  if (!isValidDifficulty(difficulty)) {
    throw new ApiError(
      'INVALID_DIFFICULTY',
      `难度值无效，必须是 8 档之一：${DIFFICULTIES.join(' / ')}`,
      400
    )
  }
  if (timeLimit !== undefined && timeLimit !== null) {
    const t = parseLimit(timeLimit, 1000)
    if (t < 1 || t > 30000) {
      throw new ApiError('INVALID_TIME_LIMIT', '时间限制必须在1-30000ms之间', 400)
    }
  }
  if (memoryLimit !== undefined && memoryLimit !== null) {
    const m = parseLimit(memoryLimit, 128)
    if (m < 1 || m > 1024) {
      throw new ApiError('INVALID_MEMORY_LIMIT', '内存限制必须在1-1024MB之间', 400)
    }
  }
  const VALID_COMPARISON_MODES = [
    'default',
    'strict',
    'ignore-spaces',
    'real-number',
    'special-judge',
  ]
  if (comparisonMode !== undefined && comparisonMode !== null) {
    if (!VALID_COMPARISON_MODES.includes(comparisonMode as string)) {
      throw new ApiError(
        'INVALID_COMPARISON_MODE',
        '比较模式无效，必须是：default、strict、ignore-spaces、real-number、special-judge',
        400
      )
    }
  }
  if (realPrecision !== undefined && realPrecision !== null) {
    const p = parseLimit(realPrecision, 3)
    if (p < 0 || p > 12) {
      throw new ApiError('INVALID_REAL_PRECISION', '浮点数精度必须在0-12之间', 400)
    }
  }
  const spjCode = rawSpjCode
  if (comparisonMode === 'special-judge') {
    if (typeof spjCode !== 'string' || !spjCode.trim()) {
      throw new ApiError('MISSING_SPJ_CODE', 'Special Judge 模式下必须提供 checker.cpp 源码（spjCode）', 400)
    }
    if (Buffer.byteLength(spjCode, 'utf8') > 512 * 1024) {
      throw new ApiError('SPJ_CODE_TOO_LARGE', 'Special Judge 代码过大（上限 512KB）', 400)
    }
  } else if (spjCode !== undefined && spjCode !== null && typeof spjCode !== 'string') {
    throw new ApiError('INVALID_SPJ_CODE', 'spjCode 必须是字符串', 400)
  }
  if (tags !== undefined && tags !== null && !Array.isArray(tags)) {
    throw new ApiError('INVALID_TAGS', '标签格式无效', 400)
  }
  if (testCases !== undefined && testCases !== null) {
    if (!Array.isArray(testCases)) {
      throw new ApiError('INVALID_TEST_CASES', '测试用例必须是数组', 400)
    }
    for (const tc of testCases) {
      if (!tc || typeof tc !== 'object') {
        throw new ApiError('INVALID_TEST_CASES', '测试用例格式无效', 400)
      }
    }
  }

  const sanitizedTitle = escapeHtml(title as string)
  const sanitizedDescription = description as string
  const sanitizedInput = input ? (input as string) : ''
  const sanitizedOutput = output ? (output as string) : ''
  const sanitizedHint = hint ? escapeHtml(hint as string) : null
  const sanitizedSource = source ? escapeHtml(source as string) : null

  const finalProblemNumber = await ensureAdminProblemNumber(problemNumber as string | undefined)
  const timeLimitValue = parseLimit(timeLimit, 1000)
  const memoryLimitValue = parseLimit(memoryLimit, 128)

  const problemData: Prisma.ProblemCreateInput = {
    problemNumber: finalProblemNumber,
    title: sanitizedTitle,
    description: sanitizedDescription,
    background: background ? (background as string) : null,
    input: sanitizedInput,
    output: sanitizedOutput,
    samples: samples || [],
    hint: sanitizedHint,
    source: sanitizedSource,
    difficulty: difficulty as string,
    tags: (tags as string[]) || [],
    timeLimit: timeLimitValue,
    memoryLimit: memoryLimitValue,
    comparisonMode: VALID_COMPARISON_MODES.includes(comparisonMode as string)
      ? (comparisonMode as string)
      : 'default',
    realPrecision: parseLimit(realPrecision, 3),
    spjCode:
      comparisonMode === 'special-judge' && typeof spjCode === 'string'
        ? spjCode
        : typeof spjCode === 'string' && spjCode.trim()
          ? spjCode
          : null,
    isPublic: visibility === 'public',
    visibility: (visibility as string) || 'public',
    totalSubmit: 0,
    totalAccepted: 0,
    author: { connect: { id: authorId } },
  }

  // 洛谷约定：SPJ 题应带「Special Judge」标签
  if (problemData.comparisonMode === 'special-judge') {
    const tagList = Array.isArray(problemData.tags) ? [...problemData.tags] : []
    if (!tagList.some((t: string) => String(t).toLowerCase() === 'special judge')) {
      tagList.push('Special Judge')
    }
    problemData.tags = tagList
  }

  if (testCases && Array.isArray(testCases) && testCases.length > 0) {
    problemData.testCases = {
      create: testCases.map((tc: Record<string, unknown>, idx: number) => {
        // 单测点限制范围校验：与题目主表一致（1-30000ms / 1-1024MB），
        // 避免误配超大值导致该测点可无限运行占用评测槽位
        const tcTime =
          tc.timeLimit === undefined || tc.timeLimit === null ? null : Number(tc.timeLimit)
        const tcMemory =
          tc.memoryLimit === undefined || tc.memoryLimit === null ? null : Number(tc.memoryLimit)
        if (tcTime !== null && (Number.isNaN(tcTime) || tcTime < 1 || tcTime > 30000)) {
          throw new ApiError('INVALID_TIME_LIMIT', '测试点时间限制必须在1-30000ms之间', 400)
        }
        if (tcMemory !== null && (Number.isNaN(tcMemory) || tcMemory < 1 || tcMemory > 1024)) {
          throw new ApiError('INVALID_MEMORY_LIMIT', '测试点内存限制必须在1-1024MB之间', 400)
        }
        return {
          input: String(tc.input || ''),
          output: String(tc.output || ''),
          isSample: Boolean(tc.isSample),
          score: Number(tc.score) || 10,
          timeLimit: tcTime,
          memoryLimit: tcMemory,
          orderIndex: idx,
        }
      }),
    }
  }

  const problem = await prisma.problem.create({
    data: problemData,
    include: { testCases: true },
  })

  if (problem.testCases && problem.testCases.length > 0) {
    await redistributeTestScores(problem.id)
  }
  clearProblemCache(problem.id)
  return problem
}

/* ============================================================================
 * 管理员编辑/获取/删除题目（原 /api/admin/problems/[id]）
 * ========================================================================== */

/**
 * 清除单道题目的全部缓存（byId + statusCounts）
 */
export function clearProblemCache(problemId: string) {
  cache.delete(CacheKeys.problem.byId(problemId))
  // statusCounts 实际 key 含 contestId/viewerId 变体，需按题目前缀失效
  cache.deleteByPrefix(CacheKeys.problem.statusCounts(problemId))
  cache.delete(CacheKeys.problem.stats(problemId))
  cache.deleteByPrefix(CacheKeys.problem.tags())
}

const ADMIN_PROBLEM_EDITABLE_FIELDS = [
  'problemNumber',
  'title',
  'description',
  'background',
  'input',
  'output',
  'samples',
  'hint',
  'source',
  'difficulty',
  'tags',
  'timeLimit',
  'memoryLimit',
  'comparisonMode',
  'realPrecision',
  'spjCode',
  'visibility',
] as const

export async function getAdminProblemById(id: string) {
  return prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: { orderBy: { orderIndex: 'asc' } },
      author: { select: { username: true, nickname: true } },
    },
  })
}

export async function updateAdminProblem(
  id: string,
  body: Record<string, unknown>,
  operator?: { id: string; username: string; ip?: string }
) {
  const existingProblem = await prisma.problem.findUnique({ where: { id } })
  if (!existingProblem) throw new ApiError('NOT_FOUND', '题目不存在', 404)

  // ===== 字段校验（与 createAdminProblem 范围保持一致）=====
  // 之前 update 路径完全跳过校验，可绕过 create 时的 timeLimit/memoryLimit/difficulty/comparisonMode 范围，
  // 导致题目主表存在非法值（如 timeLimit=999999ms / difficulty="xxx"）。
  if (body.problemNumber !== undefined && body.problemNumber !== null) {
    if (typeof body.problemNumber !== 'string' || body.problemNumber.length > 50) {
      throw new ApiError('INVALID_NUMBER', '题目编号长度必须在 1-50 个字符之间', 400)
    }
    if (body.problemNumber !== existingProblem.problemNumber) {
      const duplicate = await prisma.problem.findUnique({
        where: { problemNumber: body.problemNumber },
      })
      if (duplicate) {
        throw new ApiError('DUPLICATE_NUMBER', '题目编号已存在', 400)
      }
    }
  }
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 200) {
      throw new ApiError('INVALID_TITLE', '题目标题长度必须在1-200个字符之间', 400)
    }
  }
  if (body.difficulty !== undefined && body.difficulty !== null) {
    if (!isValidDifficulty(body.difficulty)) {
      throw new ApiError(
        'INVALID_DIFFICULTY',
        `难度值无效，必须是 8 档之一：${DIFFICULTIES.join(' / ')}`,
        400
      )
    }
  }
  if (body.timeLimit !== undefined && body.timeLimit !== null) {
    const t = parseLimit(body.timeLimit, 1000)
    if (t < 1 || t > 30000) {
      throw new ApiError('INVALID_TIME_LIMIT', '时间限制必须在1-30000ms之间', 400)
    }
  }
  if (body.memoryLimit !== undefined && body.memoryLimit !== null) {
    const m = parseLimit(body.memoryLimit, 128)
    if (m < 1 || m > 1024) {
      throw new ApiError('INVALID_MEMORY_LIMIT', '内存限制必须在1-1024MB之间', 400)
    }
  }
  const VALID_COMPARISON_MODES = [
    'default',
    'strict',
    'ignore-spaces',
    'real-number',
    'special-judge',
  ]
  if (body.comparisonMode !== undefined && body.comparisonMode !== null) {
    if (!VALID_COMPARISON_MODES.includes(body.comparisonMode as string)) {
      throw new ApiError(
        'INVALID_COMPARISON_MODE',
        '比较模式无效，必须是：default、strict、ignore-spaces、real-number、special-judge',
        400
      )
    }
  }
  if (body.realPrecision !== undefined && body.realPrecision !== null) {
    const p = parseLimit(body.realPrecision, 3)
    if (p < 0 || p > 12) {
      throw new ApiError('INVALID_REAL_PRECISION', '浮点数精度必须在0-12之间', 400)
    }
  }
  const nextMode =
    body.comparisonMode !== undefined && body.comparisonMode !== null
      ? body.comparisonMode
      : existingProblem.comparisonMode
  const nextSpj =
    body.spjCode !== undefined ? body.spjCode : (existingProblem as { spjCode?: string | null }).spjCode
  if (nextMode === 'special-judge') {
    if (typeof nextSpj !== 'string' || !nextSpj.trim()) {
      throw new ApiError('MISSING_SPJ_CODE', 'Special Judge 模式下必须提供 checker.cpp 源码（spjCode）', 400)
    }
    if (Buffer.byteLength(nextSpj, 'utf8') > 512 * 1024) {
      throw new ApiError('SPJ_CODE_TOO_LARGE', 'Special Judge 代码过大（上限 512KB）', 400)
    }
  } else if (body.spjCode !== undefined && body.spjCode !== null && typeof body.spjCode !== 'string') {
    throw new ApiError('INVALID_SPJ_CODE', 'spjCode 必须是字符串', 400)
  }
  if (body.visibility !== undefined && body.visibility !== null) {
    if (!['public', 'private', 'contest'].includes(body.visibility as string)) {
      throw new ApiError('INVALID_VISIBILITY', '可见性无效，必须是：public、private、contest', 400)
    }
  }
  if (body.tags !== undefined && body.tags !== null && !Array.isArray(body.tags)) {
    throw new ApiError('INVALID_TAGS', '标签格式无效', 400)
  }

  // 删除前预留审计信息（用于审计日志）
  const beforeSnapshot = {
    problemNumber: existingProblem.problemNumber,
    title: existingProblem.title,
    difficulty: existingProblem.difficulty,
    timeLimit: existingProblem.timeLimit,
    memoryLimit: existingProblem.memoryLimit,
    visibility: existingProblem.visibility,
  }

  const updateData: Prisma.ProblemUpdateInput = {}
  for (const field of ADMIN_PROBLEM_EDITABLE_FIELDS) {
    if (field in body) (updateData as Record<string, unknown>)[field] = body[field]
  }
  // visibility 为唯一真相源；isPublic 仅派生写入以保持索引字段一致
  if (updateData.visibility) {
    updateData.isPublic = updateData.visibility === 'public'
  }
  // 非 SPJ 模式可清空 spjCode；SPJ 模式自动补「Special Judge」标签
  if (nextMode === 'special-judge') {
    const baseTags = Array.isArray(updateData.tags)
      ? updateData.tags
      : Array.isArray(existingProblem.tags)
        ? [...existingProblem.tags]
        : []
    if (!baseTags.some((t: string) => String(t).toLowerCase() === 'special judge')) {
      updateData.tags = [...baseTags, 'Special Judge']
    } else if (updateData.tags === undefined && body.tags === undefined) {
      // 未改 tags 且已有标签时无需写
    }
  } else if (body.comparisonMode !== undefined && body.comparisonMode !== 'special-judge') {
    if (body.spjCode === undefined) {
      updateData.spjCode = null
    }
  }

  // 单测点限制范围校验（与题目主表一致：1-30000ms / 1-1024MB）
  if (body.testCases && Array.isArray(body.testCases)) {
    for (const tc of body.testCases as Record<string, unknown>[]) {
      const tcTime =
        tc.timeLimit === undefined || tc.timeLimit === null ? null : Number(tc.timeLimit)
      const tcMemory =
        tc.memoryLimit === undefined || tc.memoryLimit === null ? null : Number(tc.memoryLimit)
      if (tcTime !== null && (Number.isNaN(tcTime) || tcTime < 1 || tcTime > 30000)) {
        throw new ApiError('INVALID_TIME_LIMIT', '测试点时间限制必须在1-30000ms之间', 400)
      }
      if (tcMemory !== null && (Number.isNaN(tcMemory) || tcMemory < 1 || tcMemory > 1024)) {
        throw new ApiError('INVALID_MEMORY_LIMIT', '测试点内存限制必须在1-1024MB之间', 400)
      }
    }
  }

  // 题目字段与测点替换必须同事务，避免 deleteMany 成功后 createMany 失败导致 0 测点
  await prisma.$transaction(async (tx) => {
    await tx.problem.update({ where: { id }, data: updateData })

    if (body.testCases && Array.isArray(body.testCases)) {
      await tx.testCase.deleteMany({ where: { problemId: id } })
      if (body.testCases.length > 0) {
        await tx.testCase.createMany({
          data: body.testCases.map((tc: Record<string, unknown>, idx: number) => ({
            problemId: id,
            input: (tc.input as string) || '',
            output: (tc.output as string) || '',
            isSample: Boolean(tc.isSample) || false,
            score: (tc.score as number) || 10,
            timeLimit:
              tc.timeLimit === undefined || tc.timeLimit === null ? null : Number(tc.timeLimit),
            memoryLimit:
              tc.memoryLimit === undefined || tc.memoryLimit === null
                ? null
                : Number(tc.memoryLimit),
            orderIndex: idx,
          })),
        })
      }
    }
  })

  if (body.testCases && Array.isArray(body.testCases)) {
    await invalidateProblemTestCaseCache(id)
    if (body.testCases.length > 0) {
      // 仅当总分不是 100 时均分，避免覆盖用户手动设定的分数
      const scoreSum = body.testCases.reduce(
        (sum: number, tc) => sum + (Number(tc?.score) || 0),
        0
      )
      if (scoreSum !== 100) {
        await redistributeTestScores(id)
      }
    }
  }

  // 审计日志（参考 HOJ AdminProblemManager.updateProblem 的 log.info 记录）
  if (operator) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: operator.id,
          action: 'UPDATE_PROBLEM',
          resource: 'problems',
          details: {
            problemId: id,
            before: beforeSnapshot,
            after: {
              problemNumber: updateData.problemNumber,
              title: updateData.title,
              difficulty: updateData.difficulty,
              timeLimit: updateData.timeLimit,
              memoryLimit: updateData.memoryLimit,
              visibility: updateData.visibility,
            },
          },
          ip: operator.ip,
        },
      })
    } catch (err) {
      logger.warn(`[problem] 更新题目 ${id} 写入审计日志失败`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  }).then((result) => {
    clearProblemCache(id)
    return result
  })
}

export async function deleteAdminProblem(
  id: string,
  operator?: { id: string; username: string; ip?: string }
) {
  const problem = await prisma.problem.findUnique({ where: { id } })
  if (!problem) throw new ApiError('NOT_FOUND', '题目不存在', 404)

  // 删除前预留审计信息（删除后无法再查到 problemNumber/title）
  const auditSnapshot = {
    problemId: id,
    problemNumber: problem.problemNumber,
    title: problem.title,
  }

  // 回退已 AC 用户的 solvedCount（参考 HOJ user_acproblem 表的级联语义）
  const acUsers = await prisma.submission.findMany({
    where: { problemId: id, status: 'AC' },
    select: { userId: true },
    distinct: 'userId',
  })
  if (acUsers.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: acUsers.map(u => u.userId) } },
      data: { solvedCount: { decrement: 1 } },
    })
  }

  // 显式删除相关数据，解决外键约束问题（与批量删除共用级联清理）
  await purgeProblemDependents([id])
  await prisma.problem.delete({ where: { id } })

  // 参考 Hydro 的"硬删 document + 软删 storage 文件"策略，
  // 这里也同步清理磁盘上的测试点文件（DB 已删，磁盘文件不再有用）
  // 失败仅 warn，不阻塞删除流程（DB 删除已成功）
  try {
    await deleteTestCaseFiles(id)
  } catch (err) {
    logger.warn(`[problem] 删除题目 ${id} 的磁盘测试点文件失败`, {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // LOGIC-09: 先写 DB 再清缓存，避免缓存清空后、DB 写入前出现缓存击穿读到旧值
  // （与 updateProblem 的顺序保持一致）
  clearProblemCache(id)

  // 审计日志（参考 HOJ AdminProblemManager.deleteProblem 的 log.info 记录）
  if (operator) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: operator.id,
          action: 'DELETE_PROBLEM',
          resource: 'problems',
          details: auditSnapshot,
          ip: operator.ip,
        },
      })
    } catch (err) {
      logger.warn(`[problem] 删除题目 ${id} 写入审计日志失败`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info(`[problem] 删除题目 ${id}`, auditSnapshot)
  return { message: '题目已删除' }
}
