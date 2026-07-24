/**
 * lib/problem/submissions.ts
 * 提交记录（合并题库 + 班级作业两条流）
 */
import { prisma } from '@/lib/prisma'
import { isObjectIdLike } from './lookup'

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
  // 作业提交会同时写入 Submission（带 assignmentSubmissionId）与 ClassAssignmentSubmission。
  // 合并时排除已关联作业的 Submission，避免同一提交出现两次、total 翻倍。
  const submissionWhere: any = {
    problemId: problem.id,
    OR: [{ assignmentSubmissionId: null }, { assignmentSubmissionId: { isSet: false } }],
  }
  if (filter.userId) submissionWhere.userId = filter.userId

  // Fetch at most page*limit from each table to bound memory (no full table scan)
  const fetchLimit = page * limit
  const [submissions, classSubmissions, totalSubmissions, totalClassSubmissions] =
    await Promise.all([
      prisma.submission.findMany({
        where: submissionWhere,
        orderBy: { submittedAt: 'desc' },
        take: fetchLimit,
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
        take: fetchLimit,
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
