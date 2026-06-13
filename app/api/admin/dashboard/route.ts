/**
 * /api/admin/dashboard - 仪表盘数据（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { computeAdminDashboard } from '@/lib/admin/dashboard'

/**
 * GET /api/admin/dashboard - 获取仪表盘数据（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const data = await computeAdminDashboard()
  return ok(data)
})
