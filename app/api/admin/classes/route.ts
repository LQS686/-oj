/**
 * /api/admin/classes - 班级列表（管理员）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listAllClassesForAdmin } from '@/lib/class/service'

/**
 * GET /api/admin/classes - 班级列表（管理员）
 */
export const GET = withApi.admin(async () => {
  const data = await listAllClassesForAdmin()
  return ok(data)
})
