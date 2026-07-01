/**
 * /api/admin/permissions - 权限点列表（管理员）
 *
 * GET  列出所有 Permission（按 module 排序）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/permissions
 * 返回所有权限点，按 module 升序、code 升序
 */
export const GET = withApi.auth(withPermission('admin.access')(async () => {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { code: 'asc' }],
  })
  return ok(permissions)
}))
