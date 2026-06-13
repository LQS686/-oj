/**
 * /api/contests/[id]/submissions - 竞赛代码提交 + 提交列表
 *
 * POST   提交竞赛代码（需登录）
 * GET    获取竞赛提交列表（按访问权限）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, readQuery, throw400 } from '@/lib/api/withApi'
import { isObjectId, toInt } from '@/lib/api/validation'
import { getUserFromRequest } from '@/lib/auth'
import { checkContestAccess } from '@/lib/contest-auth'
import {
  submitContestCode,
  listContestSubmissionsPaged,
} from '@/lib/contest/service'

// POST /api/contests/[id]/submissions - 提交竞赛代码
export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: contestId } = (ctx as any).params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  const body = await readJson<{ problemId: string; code: string; language: string }>(req)
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  const result = await submitContestCode({
    contestId: contestId!,
    userId: user.id,
    isAdmin,
    problemId: body.problemId,
    code: body.code,
    language: body.language,
  })
  return ok(result, { status: 201 })
})

// GET /api/contests/[id]/submissions - 获取竞赛提交列表
export const GET = withApi.public(async (req, ctx) => {
  const { id: contestId } = (ctx as any).params
  if (!isObjectId(contestId)) throw400('INVALID_ID', '无效的竞赛ID')

  // 验证访问权限
  const currentUser = getUserFromRequest(req)
  const access = await checkContestAccess(contestId!, currentUser, req)
  if (!access.allowed) {
    const { fail } = await import('@/lib/api/response')
    return fail('FORBIDDEN', access.error || '禁止访问', access.status || 403)
  }

  const q = readQuery<{ page?: string; limit?: string; userId?: string; problemId?: string }>(req)
  const result = await listContestSubmissionsPaged(contestId!, {
    page: toInt(q.page, 'page', 1),
    limit: toInt(q.limit, 'limit', 20),
    userId: q.userId,
    problemId: q.problemId,
  })
  return ok(result)
})
