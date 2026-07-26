/**
 * /api/submissions/[id] - 提交详情
 *
 * 仅查主 Submission（作业提交同样写入主表）。
 * 鉴权：必须登录；非提交者本人/非管理员仅返回元数据（不含 code 字段）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { getSubmissionDetail } from '@/lib/submission/service'
import { isObjectId } from '@/lib/api/validation'
import { canAccessAdmin } from '@/lib/permissions'
import { AppError } from '@/lib/errors'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')
  const detail = await getSubmissionDetail(id)
  if (!detail) throw AppError.notFound('提交记录不存在')

  const isOwnerOrAdmin = detail.userId === user.id || canAccessAdmin(user)
  if (isOwnerOrAdmin) return ok(detail)

  // 非提交者本人且非管理员：脱敏 code 字段（显式挑选字段，避免解构 union 时丢类型）
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
    message: detail.message,
    submittedAt: detail.submittedAt,
    problem: detail.problem,
    user: detail.user,
    testResults: detail.testResults,
  })
})
