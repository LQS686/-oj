/**
 * /api/admin/classes/[id] - 管理员单个班级操作
 *
 * PATCH  更新班级可见性
 * DELETE 删除班级
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/admin/classes/[id] - 更新班级可见性（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{ isPublic?: boolean }>(req)
  const { isPublic } = body

  const classData = await prisma.class.findUnique({
    where: { id },
  })

  if (!classData) throw404('班级不存在')

  await prisma.class.update({
    where: { id },
    data: { isPublic },
  })

  return ok({ message: isPublic ? '班级已设为公开' : '班级已设为私有' })
})

/**
 * DELETE /api/admin/classes/[id] - 删除班级（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  await prisma.class.delete({
    where: { id },
  })

  return ok({ message: '班级已删除' })
})
