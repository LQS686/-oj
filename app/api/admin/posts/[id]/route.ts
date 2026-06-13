/**
 * /api/admin/posts/[id] - 管理员单个帖子操作
 *
 * PATCH  更新帖子状态（置顶/锁定）
 * DELETE 逻辑删除帖子
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { updatePostDirect, softDeletePostDirect } from '@/lib/mongodb-direct'

/**
 * PATCH /api/admin/posts/[id] - 更新帖子状态（置顶/锁定）（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<Record<string, any>>(req)

  // 使用 MongoDB 原生驱动直接更新，绕过 Prisma 事务限制
  // 因为当前 MongoDB 可能运行在单机模式，不支持事务
  await updatePostDirect(id, body)

  // 为了返回一致的格式，我们可以重新获取帖子
  // 这里使用 Prisma 获取是安全的，因为只是读取
  const post = await prisma.post.findUnique({
    where: { id },
  })

  return ok({ data: post })
})

/**
 * DELETE /api/admin/posts/[id] - 删除帖子（逻辑删除）（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // 使用 MongoDB 原生驱动直接删除（逻辑删除），绕过 Prisma 事务限制
  await softDeletePostDirect(id)

  return ok({ message: '帖子已删除' })
})
