/**
 * /api/admin/ai/solution/regenerate - 重新生成 AI 官方题解（统一入口）
 *
 * POST 接受 { problemId }，调 enqueueSolutionRegeneration
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, throw400, readJson } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { enqueueSolutionRegeneration } from '@/lib/ai/service'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<{ problemId?: string }>(req)
  const rawProblemId = body?.problemId
  // 三元 + throw400(never) 收窄 problemId 为 string（控制流分析对 never 返回的 const 箭头不可靠）
  const problemId = isObjectId(rawProblemId)
    ? rawProblemId
    : throw400('INVALID_ID', '无效的题目 ID 格式')
  const result = await enqueueSolutionRegeneration(problemId, user.id)
  return ok({ logId: result.logId })
})
