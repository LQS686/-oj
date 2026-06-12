/**
 * lib/problem/service.ts
 * 题目 CRUD、标签、状态、提交列表
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
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
