/**
 * /api/admin/posts - 帖子列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import { listAllPostsForAdmin } from '@/lib/post/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await listAllPostsForAdmin()
  return ok(data)
})
