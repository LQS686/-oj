/**
 * /api/admin/ai/cancel - 取消 AI 任务（管理员）
 *
 * POST 接受 { logId }，调 cancelAiJob
 * 仅 PENDING 状态可取消（service 层校验，非 PENDING 抛 INVALID_STATUS 400）
 * 返回 { success: true, data: { logId, cancelled: true } }
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { cancelAiJob } from '@/lib/ai/service'

export const POST = withApi.admin(async (req) => {
  const body = await readJson<{ logId?: string }>(req)
  const rawLogId = body?.logId
  // 三元 + throw400(never) 收窄 logId 为 string
  const logId = isObjectId(rawLogId)
    ? rawLogId
    : throw400('INVALID_ID', '无效的 logId 格式')
  const result = await cancelAiJob(logId)
  return ok(result)
})
