/**
 * /api/admin/users - 管理员用户列表 / 创建
 *
 * GET  获取所有用户
 * POST （已在下方合并：见 [id] 路由；本文件仅 GET）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/users - 获取所有用户列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  // 获取所有用户
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      rating: true,
      rank: true,
      isAdmin: true,
      role: true,
      isSuperAdmin: true,
      isBanned: true,
      createdAt: true,
      _count: {
        select: {
          submissions: true,
          problems: true,
        },
      },
    },
  })

  return ok(users)
})
