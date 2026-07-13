/**
 * lib/problem/service.ts
 * 题目 CRUD、标签、状态、提交列表
 */
import { prisma, Prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import { ensureTotalScoreIs100, redistributeTestScores } from '@/lib/problem/testcase'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { ApiError } from '@/lib/api/withApi'
import type { TestCaseInput } from '@/types/api'

export interface ProblemListFilter {
  keyword?: string
  tagIds?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  isPublic?: boolean
  categoryId?: string
}

export async function listProblemTags(): Promise<string[]> {
  const problems = await prisma.problem.findMany({
    where: {
      OR: [{ isPublic: true }, { visibility: 'public' }],
    },
    select: { tags: true },
  })

  const tagSet = new Set<string>()
  problems.forEach((p: any) => {
    if (Array.isArray(p.tags)) {
      p.tags.forEach((tag: any) => {
        if (tag && typeof tag === 'string' && tag.trim()) {
          tagSet.add(tag.trim())
        }
      })
    }
  })

  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export async function listProblems(
  filter: ProblemListFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.tagIds?.length) where.tags = { hasSome: filter.tagIds }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
    }),
    prisma.problem.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getProblemById(id: string) {
  return cache.get('problem:byId', [id], async () => {
    return prisma.problem.findUnique({ where: { id } })
  }, { ttl: 60_000 })
}

export async function createProblem(data: any, authorId: string) {
  const problem = await prisma.problem.create({ data: { ...data, authorId } })
  clearProblemCache(problem.id)
  return problem
}

export async function updateProblem(id: string, data: any) {
  clearProblemCache(id)
  return prisma.problem.update({ where: { id }, data })
}

export async function deleteProblem(id: string) {
  clearProblemCache(id)
  return prisma.problem.delete({ where: { id } })
}

export async function listTags() {
  return cache.get('problem:tags', [], async () => {
    const problems = await prisma.problem.findMany({
      where: { isPublic: true },
      select: { tags: true },
    })
    const set = new Set<string>()
    for (const p of problems) for (const t of p.tags) set.add(t)
    return Array.from(set).sort().map((name) => ({ name }))
  }, { ttl: 5 * 60_000 })
}

export async function getProblemStatusCounts(problemId: string) {
  return cache.get('problem:statusCounts', [problemId], async () => {
    const groups = await prisma.submission.groupBy({
      by: ['status'],
      where: { problemId },
      _count: { status: true },
    })
    return groups.reduce((acc: any, g: any) => {
      acc[g.status] = g._count.status
      return acc
    }, {} as Record<string, number>)
  }, { ttl: 30_000 })
}

/* ============================================================================
 * 题目详情 / 创建（含测试用例）
 * ========================================================================== */

/** 通过 ObjectId 或 problemNumber 解析题目 */
export async function findProblemByIdOrNumber(idOrNumber: string) {
  const where: any = isObjectIdLike(idOrNumber)
    ? { id: idOrNumber }
    : { problemNumber: idOrNumber }
  return prisma.problem.findFirst({
    where,
    include: {
      author: { select: { id: true, username: true, nickname: true } },
      testCases: {
        where: { isSample: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })
}

function isObjectIdLike(s: string) {
  return /^[0-9a-fA-F]{24}$/.test(s)
}

export interface CreateProblemInput {
  title: string
  description: string
  input: string
  output: string
  samples?: any
  hint?: string
  source?: string
  difficulty: string
  tags?: string[]
  timeLimit?: number
  memoryLimit?: number
  comparisonMode?: string
  realPrecision?: number
  isPublic?: boolean
  testCases?: TestCaseInput[]
  authorId: string
}

export async function createProblemWithTestcases(input: CreateProblemInput) {
  const VALID_COMPARISON_MODES = ['default', 'strict', 'ignore-spaces', 'real-number']
  const problem = await prisma.problem.create({
    data: {
      title: input.title,
      description: input.description,
      input: input.input,
      output: input.output,
      samples: input.samples || [],
      hint: input.hint,
      source: input.source,
      difficulty: input.difficulty,
      tags: input.tags || [],
      timeLimit: input.timeLimit || 1000,
      memoryLimit: input.memoryLimit || 128,
      comparisonMode: VALID_COMPARISON_MODES.includes(input.comparisonMode as string)
        ? (input.comparisonMode as string)
        : 'default',
      realPrecision:
        typeof input.realPrecision === 'number' && input.realPrecision >= 0
          ? input.realPrecision
          : 3,
      isPublic: input.isPublic ?? false,
      authorId: input.authorId,
    },
  })

  if (input.testCases && Array.isArray(input.testCases)) {
    const normalized = ensureTotalScoreIs100(
      input.testCases.map((tc, index) => ({
        input: tc.input,
        output: tc.output,
        isSample: tc.isSample || false,
        score: tc.score || 0,
        timeLimit: tc.timeLimit,
        memoryLimit: tc.memoryLimit,
        orderIndex: index + 1,
      }))
    )
    await Promise.all(
      normalized.map((tc) =>
        prisma.testCase.create({
          data: {
            problemId: problem.id,
            input: tc.input,
            output: tc.output,
            isSample: tc.isSample,
            score: tc.score,
            timeLimit: tc.timeLimit ?? null,
            memoryLimit: tc.memoryLimit ?? null,
            orderIndex: tc.orderIndex,
          },
        })
      )
    )
  }
  clearProblemCache(problem.id)
  return problem
}

/* ============================================================================
 * 提交记录（合并题库 + 班级作业两条流）
 * ========================================================================== */

export interface ListProblemSubmissionsFilter {
  page?: number
  pageSize?: number
  userId?: string
}

export async function listProblemSubmissionsMerged(
  idOrNumber: string,
  filter: ListProblemSubmissionsFilter = {}
) {
  const where: any = isObjectIdLike(idOrNumber) ? { id: idOrNumber } : { problemNumber: idOrNumber }
  const problem = await prisma.problem.findFirst({ where, select: { id: true } })
  if (!problem) return null

  const page = filter.page ?? 1
  const limit = filter.pageSize ?? 20
  const submissionWhere: any = { problemId: problem.id }
  if (filter.userId) submissionWhere.userId = filter.userId

  const [submissions, classSubmissions, totalSubmissions, totalClassSubmissions] =
    await Promise.all([
      prisma.submission.findMany({
        where: submissionWhere,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          status: true,
          language: true,
          time: true,
          memory: true,
          score: true,
          passedTests: true,
          totalTests: true,
          submittedAt: true,
          user: { select: { id: true, username: true, nickname: true } },
        },
      }),
      prisma.classAssignmentSubmission.findMany({
        where: {
          problemId: problem.id,
          ...(filter.userId ? { userId: filter.userId } : {}),
        },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          status: true,
          language: true,
          time: true,
          memory: true,
          score: true,
          passedTests: true,
          totalTests: true,
          submittedAt: true,
          userId: true,
        },
      }),
      prisma.submission.count({ where: submissionWhere }),
      prisma.classAssignmentSubmission.count({
        where: {
          problemId: problem.id,
          ...(filter.userId ? { userId: filter.userId } : {}),
        },
      }),
    ])

  const classUserIds = Array.from(new Set(classSubmissions.map((s: any) => s.userId)))
  const users = classUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: classUserIds } },
        select: { id: true, username: true, nickname: true },
      })
    : []
  const userMap = new Map(users.map((u: any) => [u.id, u]))

  const formattedClass = classSubmissions.map((s: any) => ({
    id: s.id,
    status: s.status,
    language: s.language,
    time: s.time,
    memory: s.memory,
    score: s.score,
    passedTests: s.passedTests,
    totalTests: s.totalTests,
    submittedAt: s.submittedAt,
    user: userMap.get(s.userId) || {
      id: s.userId,
      username: '未知用户',
      nickname: null,
    },
  }))

  const all = [...submissions, ...formattedClass]
    .sort(
      (a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    )
    .slice((page - 1) * limit, page * limit)

  return {
    submissions: all,
    pagination: {
      page,
      limit,
      total: totalSubmissions + totalClassSubmissions,
      totalPages: Math.ceil((totalSubmissions + totalClassSubmissions) / limit),
    },
  }
}

/* ============================================================================
 * 管理员视角：列出全部题目（含隐藏字段）/ 创建题目（含自动编号）
 * ========================================================================== */

export async function listAllProblemsForAdmin(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  return prisma.problem.findMany({
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
  })
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
  if (!['简单', '中等', '困难', '入门'].includes(difficulty as string)) {
    throw new ApiError('INVALID_DIFFICULTY', '难度值无效，必须是：入门、简单、中等、困难', 400)
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
 * 题目验证（管理员 / 作者）原 /api/admin/problems/[id]/verify
 * ========================================================================== */

export interface VerifyProblemInput {
  id: string
  verifierId: string
  isAdmin: boolean
  decision: 'accept' | 'reject' | 'fix' | 'archive'
  message?: string
  isAiGenerated?: boolean
}

/**
 * 题目的可验证者：作者 + 管理员
 */
export async function findVerifiableProblem(verifyProblemId: string) {
  return prisma.problem.findUnique({
    where: { id: verifyProblemId },
    include: { author: { select: { id: true, username: true, nickname: true } } },
  })
}

export async function applyProblemVerification(input: VerifyProblemInput) {
  const problem = await findVerifiableProblem(input.id)
  if (!problem) {
    throw new ApiError('NOT_FOUND', '题目不存在', 404)
  }
  if (input.isAiGenerated && problem.authorId !== input.verifierId && !input.isAdmin) {
    throw new ApiError('FORBIDDEN', '只有题目作者或管理员可以验证', 403)
  }

  // 拒绝 / 修复：把状态置为 PENDING，等待作者修改
  // 接受 / 归档：标记为 APPROVED 或 ARCHIVED
  const statusMap = {
    accept: 'APPROVED',
    fix: 'PENDING',
    reject: 'REJECTED',
    archive: 'ARCHIVED',
  } as const

  const newStatus = statusMap[input.decision]
  if (!newStatus) {
    throw new ApiError('INVALID_DECISION', '无效的验证决策', 400)
  }

  await prisma.problem.update({
    where: { id: input.id },
    data: {
      isAiGenerated: input.isAiGenerated ?? problem.isAiGenerated,
      aiStatus: newStatus,
    },
  })
  clearProblemCache(input.id)

  return {
    message: '验证完成',
    status: newStatus,
    decision: input.decision,
  }
}

/* ============================================================================
 * 管理员编辑/获取/删除题目（原 /api/admin/problems/[id]）
 * ========================================================================== */

/**
 * 清除单道题目的全部缓存（byId + statusCounts）
 */
export function clearProblemCache(problemId: string) {
  cache.delete(`problem:byId:${problemId}`)
  cache.delete(`problem:statusCounts:${problemId}`)
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

  // 显式删除相关数据，解决外键约束问题
  await prisma.submission.deleteMany({ where: { problemId: id } })
  await prisma.solution.deleteMany({ where: { problemId: id } })
  await prisma.contestProblem.deleteMany({ where: { problemId: id } })
  await prisma.trainingProblem.deleteMany({ where: { problemId: id } })
  await prisma.favorite.deleteMany({ where: { problemId: id } })
  await prisma.testCase.deleteMany({ where: { problemId: id } })
  await prisma.problem.delete({ where: { id } })
  clearProblemCache(id)
  return { message: '题目已删除' }
}

/* ============================================================================
 * 管理员批量题目操作 / 导出 / 审核 / 重生成题解
 * ========================================================================== */

export type BatchProblemAction = 'visibility' | 'difficulty' | 'delete'
export type BatchProblemVisibility = 'public' | 'private' | 'contest'

const VALID_VISIBILITY: BatchProblemVisibility[] = ['public', 'private', 'contest']
const VALID_DIFFICULTY = ['简单', '中等', '困难']

/**
 * 批量修改题目可见性
 */
export async function batchUpdateProblemVisibility(
  problemIds: string[],
  visibility: BatchProblemVisibility
) {
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: {
      visibility,
      isPublic: visibility === 'public',
    },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 批量修改题目难度
 */
export async function batchUpdateProblemDifficulty(problemIds: string[], difficulty: string) {
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: { difficulty },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 批量删除题目：级联删除 submissions / solutions / contestProblems / trainingProblems / favorites / testCases
 */
export async function batchDeleteProblems(problemIds: string[]) {
  await prisma.submission.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.solution.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.contestProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.trainingProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.favorite.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.testCase.deleteMany({ where: { problemId: { in: problemIds } } })
  const result = await prisma.problem.deleteMany({ where: { id: { in: problemIds } } })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 校验批量操作的入参 + ID 合法性
 */
export function validateBatchProblemInput(input: {
  action?: string
  problemIds?: string[]
  visibility?: string
  difficulty?: string
  isObjectId: (s: string) => boolean
}): { action: BatchProblemAction; problemIds: string[]; visibility?: BatchProblemVisibility; difficulty?: string } {
  const { action, problemIds, visibility, difficulty, isObjectId } = input
  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    throw new ApiError('INVALID_PROBLEM_IDS', 'problemIds 必须是非空数组', 400)
  }
  const invalidIds = problemIds.filter((id) => !isObjectId(id))
  if (invalidIds.length > 0) {
    throw new ApiError(
      'INVALID_IDS',
      `以下 ID 格式无效: ${invalidIds.slice(0, 3).join(', ')}`,
      400
    )
  }
  switch (action) {
    case 'visibility': {
      if (!visibility || !VALID_VISIBILITY.includes(visibility as BatchProblemVisibility)) {
        throw new ApiError('INVALID_VISIBILITY', '无效的可见性', 400)
      }
      return { action, problemIds, visibility: visibility as BatchProblemVisibility }
    }
    case 'difficulty': {
      if (!difficulty || !VALID_DIFFICULTY.includes(difficulty)) {
        throw new ApiError('INVALID_DIFFICULTY', '无效的难度', 400)
      }
      return { action, problemIds, difficulty }
    }
    case 'delete':
      return { action, problemIds }
    default:
      throw new ApiError('INVALID_ACTION', '无效的操作类型', 400)
  }
}

/**
 * 批量更新题目的来源标记（AI/MANUAL/AI_ASSISTED），并写入审计日志
 */
export async function batchUpdateProblemSource(
  operatorId: string,
  problemIds: string[],
  source: 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED',
  ip: string
) {
  if (!['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].includes(source)) {
    throw new ApiError('INVALID_SOURCE', '无效的来源标记', 400)
  }
  const result = await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: { aiStatus: source },
  })
  await prisma.auditLog.create({
    data: {
      userId: operatorId,
      action: 'UPDATE_PROBLEM_SOURCE',
      resource: 'problems',
      details: {
        count: result.count,
        targetSource: source,
        problemIds,
      },
      ip,
    },
  })
  problemIds.forEach(clearProblemCache)
  return result
}

/**
 * 导出题目列表（按 source 过滤）
 */
export async function listProblemsForExport(source: string = 'all') {
  const where: any = {}
  if (source !== 'all') {
    where.aiStatus = source
  }
  return prisma.problem.findMany({
    where,
    select: {
      id: true,
      title: true,
      aiStatus: true,
      createdAt: true,
      updatedAt: true,
      totalSubmit: true,
      totalAccepted: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * 待审核题目列表（isAiGenerated=false）
 */
export async function listProblemsForReview() {
  return prisma.problem.findMany({
    where: { isAiGenerated: false },
    include: {
      testCases: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * 删除题目的所有 AI_OFFICIAL 题解（保留 USER 题解）
 */
export async function deleteAiOfficialSolutionsForProblem(problemId: string) {
  return prisma.solution.deleteMany({
    where: { problemId, sourceType: 'AI_OFFICIAL' } as any,
  })
}

/**
 * 获取"重新生成 AI 官方题解"所需题目信息
 */
export async function getProblemForSolutionRegeneration(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      description: true,
      input: true,
      output: true,
      samples: true,
      stdCode: true,
      stdLang: true,
      authorId: true,
    },
  })
}

/**
 * 获取当前操作者的管理员/教师信息
 */
export async function getOperatorForSolutionRegen(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isBanned: true },
  })
}

/* ============================================================================
 * 公共题库列表 / 创建（原 /api/problems）
 * ========================================================================== */

export interface ListPublicProblemsResult {
  problems: any[]
  pagination: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

/** 公共题库列表（分页 + 关键字 + 难度 + tag 过滤） */
export async function listPublicProblems(filter: {
  page: number
  pageSize: number
  search?: string
  difficulty?: string
  tag?: string
}): Promise<ListPublicProblemsResult> {
  const { page, pageSize, search, difficulty, tag } = filter
  const where: any = { isPublic: true }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { id: { contains: search } },
    ]
  }
  if (difficulty) where.difficulty = difficulty
  if (tag) where.tags = { has: tag }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.problem.count({ where }),
  ])

  return {
    problems: items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

/** 按 title 检查是否已存在同名题目 */
export async function findProblemByTitle(title: string) {
  return prisma.problem.findFirst({ where: { title } })
}
