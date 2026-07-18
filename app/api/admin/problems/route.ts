/**
 * /api/admin/problems - 管理员题目管理
 *
 * GET  题目列表（支持 ?q=xxx 关键字模糊搜索 + ?page=&pageSize= 分页）
 * POST 创建题目
 */
import { withApi, ok, readJson } from '@/lib/api/withApi'
import { listAllProblemsForAdmin, createAdminProblem } from '@/lib/problem/service'
import { enqueueSolutionForNewProblem } from '@/lib/ai/service'

/**
 * GET /api/admin/problems - 获取题目列表（管理员）
 *
 * Query 参数：
 * - q: 关键字模糊匹配题号 / 标题（不区分大小写）
 * - page / pageSize: 分页参数（q 必须配合分页使用，避免一次性返回全表）
 */
export const GET = withApi.admin(async (req) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') || undefined
  const pageStr = url.searchParams.get('page')
  const pageSizeStr = url.searchParams.get('pageSize')
  const page = pageStr ? parseInt(pageStr, 10) : undefined
  const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : undefined
  // 模糊搜索时强制分页（默认 20 条），避免无限制返回
  if (q && (!page || !pageSize)) {
    return ok(await listAllProblemsForAdmin({ q, page: 1, pageSize: 20 }))
  }
  return ok(await listAllProblemsForAdmin({ q, page, pageSize }))
})

/**
 * POST /api/admin/problems - 创建题目（管理员）
 */
export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<Record<string, any>>(req)
  const problem = await createAdminProblem(body, user.id)

  // 入队 AI 题解生成（不阻塞题目创建响应，AI 模块异常不影响题目落库）
  try {
    const { logId } = await enqueueSolutionForNewProblem(problem.id, '', '', user.id)
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'queued', solutionLogId: logId })
  } catch (aiError) {
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'failed' })
  }
})
