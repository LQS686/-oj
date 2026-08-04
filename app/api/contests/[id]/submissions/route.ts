import { withApi, ok, readJson, readQuery, throw400, resolveViewerFromRequest } from '@/lib/api/withApi'
import { isObjectId, toInt } from '@/lib/api/validation'
import { canAccessAdmin } from '@/lib/permissions'
import { checkContestAccess } from '@/lib/contest-auth'
import {
  submitContestCode,
  listContestSubmissionsPaged,
} from '@/lib/contest/service'
import { submissionRateLimiter } from '@/lib/rate-limit'

// POST /api/contests/[id]/submissions - 提交竞赛代码
export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: contestId } = ctx.params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  // 提交频率限制（IP 维度，20 次/分钟；防止刷爆评测队列与数据库）
  const rl = await submissionRateLimiter(req)
  if (rl) return rl

  const body = await readJson<{ problemId: string; code: string; language: string }>(req)
  const adminFlag = canAccessAdmin(user)
  const result = await submitContestCode({
    contestId: contestId!,
    userId: user.id,
    viewerRole: user.role,
    isAdmin: adminFlag,
    problemId: body.problemId,
    code: body.code,
    language: body.language,
  })
  return ok(result, { status: 201 })
})

// GET /api/contests/[id]/submissions - 获取竞赛提交列表
export const GET = withApi.public(async (req, ctx) => {
  const { id: contestId } = ctx.params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  const viewer = await resolveViewerFromRequest(req)
  const currentUser = viewer?.user ?? null
  const jwtForAccess = viewer
    ? {
        userId: viewer.user.id,
        role: viewer.user.role,
        email: '',
        username: '',
        tokenVersion: viewer.tokenVersion,
      }
    : null

  const access = await checkContestAccess(contestId!, jwtForAccess, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  const q = readQuery<{ page?: string; limit?: string; userId?: string; problemId?: string }>(req)
  const bypassSeal =
    !!currentUser &&
    (canAccessAdmin(currentUser) || access.contest?.authorId === currentUser.id)

  const result = await listContestSubmissionsPaged(contestId!, {
    page: toInt(q.page, 'page', 1),
    limit: toInt(q.limit, 'limit', 20),
    userId:
      bypassSeal || (q.userId && currentUser?.id === q.userId) ? q.userId : undefined,
    problemId: q.problemId,
    viewerUserId: currentUser?.id,
    viewerRole: currentUser?.role,
    viewerBypassSeal: bypassSeal,
  })
  return ok(result)
})
