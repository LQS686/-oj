/**
 * /api/admin/problems - 管理员题目管理
 *
 * GET  题目列表
 * POST 创建题目
 */
import { withApi, ok, readJson, throw403 } from '@/lib/api/withApi'
import { listAllProblemsForAdmin, createAdminProblem } from '@/lib/problem/service'
import { enqueueSolutionJob } from '@/lib/ai/solution-queue'

/**
 * GET /api/admin/problems - 获取题目列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  return ok(await listAllProblemsForAdmin())
})

/**
 * POST /api/admin/problems - 创建题目（管理员）
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const body = await readJson<Record<string, any>>(req)
  const problem = await createAdminProblem(body, user.id)

  // 入队 AI 题解生成（不阻塞题目创建响应，AI 模块异常不影响题目落库）
  try {
    const { logId } = await enqueueSolutionJob({
      problemId: problem.id,
      title: problem.title,
      description: problem.description,
      stdCode: '',
      stdLang: '',
      authorId: user.id,
    })
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'queued', solutionLogId: logId })
  } catch (aiError) {
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'failed' })
  }
})
