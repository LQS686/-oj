/**
 * lib/problem/admin.ts
 * 管理员视角：列出全部题目（含隐藏字段）/ 创建题目（含自动编号）/ 编辑/获取/删除题目
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { redistributeTestScores } from '@/lib/problem/testcase'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { ApiError } from '@/lib/api/withApi'
import { DIFFICULTIES, isValidDifficulty, migrateDifficulty } from '@/lib/constants'

/* ============================================================================
 * 管理员视角：列出全部题目（含隐藏字段）/ 创建题目（含自动编号）
 * ========================================================================== */

export async function listAllProblemsForAdmin(opts?: {
  page?: number
  pageSize?: number
  q?: string
}) {
  const page = opts?.page
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0

  // q 关键字模糊匹配题号 / 标题（不区分大小写）
  // - "P1000" / "1000" / 标题片段均能匹配
  // - 模糊查询时强制分页，避免无 q 时一次性返回全表
  const q = opts?.q?.trim()
  const where = q
    ? {
        OR: [
          { problemNumber: { contains: q, mode: 'insensitive' as const } },
          { title: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [data, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip,
      take,
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        problemNumber: true,
        title: true,
        samples: true,
        hint: true,
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
        isAiGenerated: true,
        aiStatus: true,
      },
    }),
    prisma.problem.count({ where }),
  ])
  return {
    data,
    pagination: {
      page: usePaging ? (page as number) : 1,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  }
}

/** 校验创建/更新题目时的核心字段（抛出 ApiError 由路由 withApi 捕获） */

export interface CreateAdminProblemInput {
  problemNumber?: string
  title?: string
  description?: string
  input?: string
  output?: string
  samples?: any
  hint?: string
  source?: string
  difficulty?: string
  tags?: string[]
  timeLimit?: number | string
  memoryLimit?: number | string
  isPublic?: boolean
  visibility?: string
  testCases?: any[]
  [k: string]: any
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
  const latestProblem = await prisma.problem.findFirst({
    where: { problemNumber: { startsWith: 'P' } },
    orderBy: { problemNumber: 'desc' },
    select: { problemNumber: true },
  })
  let nextNumber = 1001
  if (latestProblem?.problemNumber) {
    const match = latestProblem.problemNumber.match(/^P(\d+)$/)
    if (match) nextNumber = parseInt(match[1], 10) + 1
  }
  return `P${nextNumber}`
}

export async function createAdminProblem(
  rawBody: Record<string, any>,
  authorId: string
) {
  const body = trimAll(rawBody)
  const {
    problemNumber,
    title,
    description,
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
    isPublic,
    visibility,
    testCases,
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
  // 难度校验：统一使用洛谷 8 档标准（lib/constants.ts）
  // - 合法 8 档直接通过
  // - 旧版 4 档（简单/中等/困难）或英文值自动迁移为 8 档标准
  // - 完全无法识别的值拒绝
  if (!isValidDifficulty(difficulty)) {
    // 尝试旧版迁移；若仍不是合法 8 档则拒绝
    if (!isValidDifficulty(migrateDifficulty(difficulty))) {
      throw new ApiError(
        'INVALID_DIFFICULTY',
        `难度值无效，必须是 8 档之一：${DIFFICULTIES.join(' / ')}（旧版简单/中等/困难将自动迁移）`,
        400
      )
    }
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
  const VALID_COMPARISON_MODES = ['default', 'strict', 'ignore-spaces', 'real-number']
  if (comparisonMode !== undefined && comparisonMode !== null) {
    if (!VALID_COMPARISON_MODES.includes(comparisonMode as string)) {
      throw new ApiError(
        'INVALID_COMPARISON_MODE',
        '比较模式无效，必须是：default、strict、ignore-spaces、real-number',
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

  const problemData: any = {
    problemNumber: finalProblemNumber,
    title: sanitizedTitle,
    description: sanitizedDescription,
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
    isPublic: visibility === 'public',
    visibility: (visibility as string) || 'public',
    totalSubmit: 0,
    totalAccepted: 0,
    author: { connect: { id: authorId } },
  }

  if (testCases && Array.isArray(testCases) && testCases.length > 0) {
    problemData.testCases = {
      create: testCases.map((tc: Record<string, unknown>, idx: number) => ({
        input: String(tc.input || ''),
        output: String(tc.output || ''),
        isSample: Boolean(tc.isSample),
        score: Number(tc.score) || 10,
        timeLimit:
          tc.timeLimit === undefined || tc.timeLimit === null ? null : Number(tc.timeLimit),
        memoryLimit:
          tc.memoryLimit === undefined || tc.memoryLimit === null
            ? null
            : Number(tc.memoryLimit),
        orderIndex: idx,
      })),
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
  cache.delete(CacheKeys.problem.statusCounts(problemId))
  cache.deleteByPrefix('problem:tags')
}

const ADMIN_PROBLEM_EDITABLE_FIELDS = [
  'problemNumber',
  'title',
  'description',
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
  'isPublic',
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
  body: Record<string, any>
) {
  const existingProblem = await prisma.problem.findUnique({ where: { id } })
  if (!existingProblem) throw new ApiError('NOT_FOUND', '题目不存在', 404)

  if (body.problemNumber && body.problemNumber !== existingProblem.problemNumber) {
    const duplicate = await prisma.problem.findUnique({
      where: { problemNumber: body.problemNumber },
    })
    if (duplicate) {
      throw new ApiError('DUPLICATE_NUMBER', '题目编号已存在', 400)
    }
  }

  const updateData: any = {}
  for (const field of ADMIN_PROBLEM_EDITABLE_FIELDS) {
    if (field in body) updateData[field] = body[field]
  }
  // Sync visibility 和 isPublic
  if (updateData.visibility) {
    updateData.isPublic = updateData.visibility === 'public'
  } else if (updateData.isPublic !== undefined) {
    updateData.visibility = updateData.isPublic ? 'public' : 'private'
  }

  await prisma.problem.update({ where: { id }, data: updateData })

  // 更新测试用例
  if (body.testCases && Array.isArray(body.testCases)) {
    await prisma.testCase.deleteMany({ where: { problemId: id } })
    if (body.testCases.length > 0) {
      await prisma.testCase.createMany({
        data: body.testCases.map((tc: any, idx: number) => ({
          problemId: id,
          input: tc.input || '',
          output: tc.output || '',
          isSample: tc.isSample || false,
          score: tc.score || 10,
          timeLimit:
            tc.timeLimit === undefined || tc.timeLimit === null ? null : Number(tc.timeLimit),
          memoryLimit:
            tc.memoryLimit === undefined || tc.memoryLimit === null
              ? null
              : Number(tc.memoryLimit),
          orderIndex: idx,
        })),
      })
      await redistributeTestScores(id)
    }
  }

  return prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  }).then((result: any) => {
    clearProblemCache(id)
    return result
  })
}

export async function deleteAdminProblem(id: string) {
  const problem = await prisma.problem.findUnique({ where: { id } })
  if (!problem) throw new ApiError('NOT_FOUND', '题目不存在', 404)

  // 回退已 AC 用户的 solvedCount
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

  // 显式删除相关数据，解决外键约束问题
  await prisma.submission.deleteMany({ where: { problemId: id } })
  await prisma.solution.deleteMany({ where: { problemId: id } })
  await prisma.contestProblem.deleteMany({ where: { problemId: id } })
  await prisma.trainingProblem.deleteMany({ where: { problemId: id } })
  await prisma.testCase.deleteMany({ where: { problemId: id } })
  await prisma.problem.delete({ where: { id } })
  clearProblemCache(id)
  return { message: '题目已删除' }
}
