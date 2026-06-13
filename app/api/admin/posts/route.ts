/**
 * /api/admin/posts - 帖子列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/posts - 获取帖子列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    where: {
      isDeleted: false, // 默认只看未删除的，如果想看已删除的可以加参数
    },
    include: {
      author: {
        select: { username: true },
      },
      _count: {
        select: {
          comments: true,
          postLikes: true,
        },
      },
    },
  })

  return ok({ data: posts })
})
