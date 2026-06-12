/**
 * lib/submission/service.ts
 * 提交 CRUD、判题结果查询
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface SubmissionFilter {
  userId?: string
  problemId?: string
  contestId?: string
  status?: string
  language?: string
}

export async function listSubmissions(
  filter: SubmissionFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.userId) where.userId = filter.userId
  if (filter.problemId) where.problemId = filter.problemId
  if (filter.contestId) where.contestId = filter.contestId
  if (filter.status) where.status = filter.status
  if (filter.language) where.language = filter.language

  const [items, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'submittedAt']: options.sortOrder || 'desc' },
    }),
    prisma.submission.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getSubmissionById(id: string) {
  return cache.get('submission:byId', [id], async () => {
    return prisma.submission.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}

export async function createSubmission(data: {
  userId: string
  problemId: string
  code: string
  language: string
  contestId?: string
  assignmentId?: string
}) {
  return prisma.submission.create({
    data: {
      ...data,
      status: 'PENDING',
      submittedAt: new Date(),
    },
  })
}

export async function updateSubmissionStatus(
  id: string,
  status: string,
  extra: Partial<{
    score: number
    time: number
    memory: number
    passedTests: number
    totalTests: number
    message: string
    testResults: any
  }> = {}
) {
  cache.delete(`submission:byId:${id}`)
  return prisma.submission.update({
    where: { id },
    data: { status, ...extra },
  })
}

export async function getProblemSubmissions(problemId: string, limit = 20) {
  return prisma.submission.findMany({
    where: { problemId },
    take: limit,
    orderBy: { submittedAt: 'desc' },
    include: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
  })
}
