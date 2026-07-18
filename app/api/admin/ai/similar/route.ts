/**
 * /api/admin/ai/similar - 生成相似题（Task 28.6）
 *
 * POST 接受 { problemId }，调 enqueueSimilarProblem(problemId, userId)
 * 读取原题信息作为 prompt 上下文，入队 mode='similar' 任务
 * 走与 PARAM_GEN 一致的预览-确认流程
 *
 * 返回 { success: true, data: { logId } }
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { enqueueSimilarProblem } from '@/lib/ai/service'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await req.json().catch(() => ({}))
  const rawProblemId = body?.problemId
  const problemId = isObjectId(rawProblemId)
    ? rawProblemId
    : throw400('INVALID_ID', '无效的 problemId 格式')
  const result = await enqueueSimilarProblem(problemId, user.id)
  return ok(result)
})
