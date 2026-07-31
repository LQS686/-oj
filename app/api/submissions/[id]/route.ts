/**
 * /api/submissions/[id] - 提交详情
 *
 * 仅查主 Submission（作业提交同样写入主表）。
 * 鉴权：必须登录；非提交者本人/非管理员仅返回元数据（不含 code / testResults）
 * 封榜期间：非本人/非管理员不可窥他人提交 verdict（与提交列表封榜一致）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { getSubmissionDetail } from '@/lib/submission/service'
import { isObjectId } from '@/lib/api/validation'
import { canAccessAdmin } from '@/lib/permissions'
import { AppError } from '@/lib/errors'
import { findProblemAccessFields, assertCanAccessProblem } from '@/lib/problem/access'
import { prisma } from '@/lib/prisma'
import { isContestSealed } from '@/lib/contest/rankings'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')
  const detail = await getSubmissionDetail(id)
  if (!detail) throw AppError.notFound('提交记录不存在')

  const isOwnerOrAdmin = detail.userId === user.id || canAccessAdmin(user)

  // 非本人：须仍能访问对应题目，避免私有/竞赛题提交 IDOR
  if (!isOwnerOrAdmin) {
    const access = await findProblemAccessFields(detail.problemId)
    if (!access) throw AppError.notFound('提交记录不存在')
    await assertCanAccessProblem(access, user, {
      contestId: detail.contestId ?? undefined,
    })
  }

  // 封榜：非本人且非作者/管理员不可查看他人竞赛提交（防已知 ID 轮询）
  if (detail.contestId && !isOwnerOrAdmin) {
    const contest = await prisma.contest.findUnique({
      where: { id: detail.contestId },
      select: { sealRankTime: true, sealUnlocked: true, authorId: true },
    })
    if (contest && isContestSealed(contest) && contest.authorId !== user.id) {
      throw AppError.notFound('提交记录不存在')
    }
  }

  if (isOwnerOrAdmin) return ok(detail)

  // 非提交者本人且非管理员：脱敏 code + testResults（防竞赛逐测点神谕）
  return ok({
    id: detail.id,
    problemId: detail.problemId,
    userId: detail.userId,
    language: detail.language,
    status: detail.status,
    score: detail.score,
    time: detail.time,
    memory: detail.memory,
    passedTests: detail.passedTests,
    totalTests: detail.totalTests,
    message: null,
    submittedAt: detail.submittedAt,
    problem: detail.problem,
    user: detail.user,
    testResults: [],
  })
})
