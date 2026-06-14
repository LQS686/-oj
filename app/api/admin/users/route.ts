/**
 * /api/admin/users - 管理员用户列表
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import { listAllUsersForAdmin } from '@/lib/user/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await listAllUsersForAdmin()
  return ok(data)
})
