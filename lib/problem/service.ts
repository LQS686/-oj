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
      { id: { contains: filter.keyword } },
    ]
  }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.isPublic !== undefined) where.isPublic = filter.isPublic
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.tagIds?.length) where.tags = { some: { tagId: { in: filter.tagIds } } }

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
  return prisma.problem.create({ data: { ...data, authorId } })
}

export async function updateProblem(id: string, data: any) {
  cache.delete(`problem:byId:${id}`)
  return prisma.problem.update({ where: { id }, data })
}

export async function deleteProblem(id: string) {
  cache.delete(`problem:byId:${id}`)
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
    return groups.reduce((acc: any, g) => {
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
  isPublic?: boolean
  testCases?: TestCaseInput[]
  authorId: string
}

export async function createProblemWithTestcases(input: CreateProblemInput) {
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
            orderIndex: tc.orderIndex,
          },
        })
      )
    )
  }
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

  const classUserIds = Array.from(new Set(classSubmissions.map((s) => s.userId)))
  const users = classUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: classUserIds } },
        select: { id: true, username: true, nickname: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const formattedClass = classSubmissions.map((s) => ({
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
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
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

export async function listAllProblemsForAdmin() {
  return prisma.problem.findMany({
    orderBy: [{ problemNumber: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      problemNumber: true,
      title: true,
      description: true,
      input: true,
      output: true,
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
    input: sanitizedInput,
    output: sanitizedOutput,
    samples: samples || [],
    hint: sanitizedHint,
    source: sanitizedSource,
    difficulty: difficulty as string,
    tags: (tags as string[]) || [],
    timeLimit: timeLimitValue,
    memoryLimit: memoryLimitValue,
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
        orderIndex: idx,
      })),
    }
  }

  const problem = await prisma.problem.create({
    data: problemData as Prisma.ProblemCreateInput,
    include: { testCases: true },
  })

  if (problem.testCases && problem.testCases.length > 0) {
    await redistributeTestScores(problem.id)
  }
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

  return {
    message: '验证完成',
    status: newStatus,
    decision: input.decision,
  }
}

/* ============================================================================
 * 管理员编辑/获取/删除题目（原 /api/admin/problems/[id]）
 * ========================================================================== */

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
          orderIndex: idx,
        })),
      })
      await redistributeTestScores(id)
    }
  }

  return prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
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
  return { message: '题目已删除' }
}
