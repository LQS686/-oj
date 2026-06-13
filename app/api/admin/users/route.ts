/**
 * /api/admin/users - 管理员用户列表
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { listAllUsersForAdmin } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const data = await listAllUsersForAdmin()
  return ok({ data })
})
