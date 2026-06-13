/**
 * /api/admin/classes - 班级列表（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/classes - 获取班级列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const classes = await prisma.class.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          members: true,
          assignments: true,
          notes: true,
        },
      },
    },
  })

  const ownerIds = [...new Set(classes.map((t) => t.ownerId))]
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true },
  })

  const ownerMap = new Map(owners.map((o) => [o.id, o.username]))

  const classesWithOwner = classes.map((classData) => ({
    ...classData,
    owner: { username: ownerMap.get(classData.ownerId) || '未知用户' },
  }))

  return ok({ data: classesWithOwner })
})
