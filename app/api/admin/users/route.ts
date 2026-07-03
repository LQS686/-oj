/**
 * /api/admin/users - 管理员用户列表
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listAllUsersForAdmin } from '@/lib/user/service'

export const GET = withApi.admin(async () => {
  const data = await listAllUsersForAdmin()
  return ok(data)
})
