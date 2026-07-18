/**
 * /api/admin/ai/problems/discard - 丢弃预览题目（Task 27.4）
 *
 * POST 接受 { logId }，调 discardPreviewedProblem
 * 仅 COMPLETED + isPreview 状态可丢弃（service 层校验）
 * 返回 { success: true, data: { discarded: true } }
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { discardPreviewedProblem } from '@/lib/ai/service'

export const POST = withApi.admin(async (req) => {
  const body = await req.json().catch(() => ({}))
  const rawLogId = body?.logId
  const logId = isObjectId(rawLogId)
    ? rawLogId
    : throw400('INVALID_ID', '无效的 logId 格式')
  const result = await discardPreviewedProblem(logId)
  return ok(result)
})
