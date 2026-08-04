/**
 * /api/admin/users - 管理员用户列表
 */
import { withApi, ok, readQuery } from '@/lib/api/withApi'
import { listAllUsersForAdmin } from '@/lib/user/service'

export const GET = withApi.admin(async (req) => {
  const q = readQuery<{ page?: string; pageSize?: string; limit?: string; search?: string; role?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || q.limit || '50') || 50))
  const data = await listAllUsersForAdmin({
    page,
    pageSize,
    search: q.search || undefined,
    role: q.role || undefined,
  })
  return ok(data)
})
