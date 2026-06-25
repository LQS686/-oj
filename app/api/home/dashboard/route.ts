/**
 * GET /api/home/dashboard — 登录用户首页仪表盘
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getHomeDashboard } from '@/lib/home/dashboard'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  const data = await getHomeDashboard(user.id)
  return ok(data)
})