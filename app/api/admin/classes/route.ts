/**
 * /api/admin/classes - 班级列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { listAllClassesForAdmin } from '@/lib/class/service'

/**
 * GET /api/admin/classes - 班级列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const data = await listAllClassesForAdmin()
  return ok(data)
})
