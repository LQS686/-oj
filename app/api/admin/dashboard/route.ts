/**
 * /api/admin/dashboard - 仪表盘数据（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import { computeAdminDashboard } from '@/lib/admin/dashboard'

/**
 * GET /api/admin/dashboard - 获取仪表盘数据（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await computeAdminDashboard()
  return ok(data)
})
