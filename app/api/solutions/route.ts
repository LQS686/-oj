/**
 * /api/solutions - 题解列表/创建
 *
 * GET  公开：按 problemId 列出题解（带权限校验、点赞状态）
 * POST 鉴权：创建题解
 */
import { withApi, ok, readJson, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import {
  listSolutionsWithPermission,
  createUserSolution,
  loadSolutionViewUser,
} from '@/lib/solution/service'
import { toInt } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{
    problemId?: string
    isAssignmentContext?: string
    page?: string
    pageSize?: string
  }>(req)

  if (!q.problemId) throw400('VALIDATION', 'problemId 不能为空')

  const isAssignmentContext = q.isAssignmentContext === 'true'
  const page = Math.max(1, toInt(q.page, 'page', 1))
  const pageSize = Math.max(1, Math.min(100, toInt(q.pageSize, 'pageSize', 20)))

  const viewer = await loadSolutionViewUser(req)
  const result = await listSolutionsWithPermission(q.problemId!, isAssignmentContext, page, pageSize, viewer)

  if (!result.found) throw404('题目不存在')
  if (!result.allowed) {
    return Response.json(
      { ok: false, success: false, error: '无权查看题解', permission: result.permission, code: 'FORBIDDEN' },
      { status: 403 }
    )
  }
  return ok({
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    permission: result.permission,
  })
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    problemId: string
    title: string
    content: string
    codeLanguage?: string | null
    code?: string | null
  }>(req)

  try {
    const solution = await createUserSolution(body, user.id)
    return ok(solution, { status: 201 })
  } catch (err: any) {
    logger.error('创建题解失败', err)
    if (err?.status === 400) throw400('VALIDATION', '请求参数不合法')
    if (err?.status === 404) throw404('资源不存在')
    throw err
  }
})
