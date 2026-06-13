/**
 * /api/admin/posts/[id] - 管理员单个帖子操作
 *
 * PATCH  更新帖子状态（置顶/锁定）
 * DELETE 逻辑删除帖子
 *
 * 注意：使用 MongoDB 原生驱动直接更新以绕过 Prisma 事务限制
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { updatePostDirect, softDeletePostDirect } from '@/lib/mongodb-direct'
import { getPostAfterMongoDirectUpdate } from '@/lib/post/service'

/**
 * PATCH /api/admin/posts/[id] - 更新帖子状态（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<Record<string, any>>(req)

  // 使用 MongoDB 原生驱动直接更新，绕过 Prisma 事务限制
  // （单实例 MongoDB 不支持事务）
  await updatePostDirect(id, body)

  // 重新查询帖子以返回最新状态
  const post = await getPostAfterMongoDirectUpdate(id)
  return ok({ data: post })
})

/**
 * DELETE /api/admin/posts/[id] - 逻辑删除帖子（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  await softDeletePostDirect(id)
  return ok({ message: '帖子已删除' })
})
