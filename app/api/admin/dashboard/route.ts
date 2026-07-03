/**
 * /api/admin/dashboard - 仪表盘数据（管理员）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { computeAdminDashboard } from '@/lib/admin/dashboard'

/**
 * GET /api/admin/dashboard - 获取仪表盘数据（管理员）
 * 通过 withApi.admin 包装，要求具备 admin.access 权限
 */
export const GET = withApi.admin(async () => {
  const data = await computeAdminDashboard()
  return ok(data)
})
