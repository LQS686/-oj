/**
 * lib/problem/submissions.ts
 * 题目提交列表（一律主 Submission.id；作业提交同样写入主表）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isObjectIdLike } from './lookup'

export interface ListProblemSubmissionsFilter {
  page?: number
  pageSize?: number
  userId?: string
}

export async function listProblemSubmissions(
  idOrNumber: string,
  filter: ListProblemSubmissionsFilter = {}
) {
  const where: Prisma.ProblemWhereInput = isObjectIdLike(idOrNumber)
    ? { id: idOrNumber }
    : { problemNumber: idOrNumber }
  const problem = await prisma.problem.findFirst({ where, select: { id: true } })
  if (!problem) return null

  const page = filter.page ?? 1
  const limit = filter.pageSize ?? 20
  const submissionWhere: Prisma.SubmissionWhereInput = {
    problemId: problem.id,
  }
  if (filter.userId) submissionWhere.userId = filter.userId

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where: submissionWhere,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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
        assignmentSubmissionId: true,
        user: { select: { id: true, username: true, nickname: true } },
      },
    }),
    prisma.submission.count({ where: submissionWhere }),
  ])

  return {
    submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}
