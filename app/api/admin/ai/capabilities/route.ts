/**
 * /api/admin/ai/capabilities - AI 能力清单（管理员）
 *
 * GET 返回当前用户角色可用的 AI 能力清单
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getAiCapabilities } from '@/lib/ai/service'

export const GET = withApi.admin(async (_req, _ctx, { user }) => {
  return ok(getAiCapabilities(user.role))
})
