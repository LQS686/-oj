/**
 * /api/training-categories/[id] - 题单分类管理
 *
 * PUT    鉴权：仅管理员
 * DELETE 鉴权：仅管理员
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { updateCategory, deleteCategory } from '@/lib/training/service'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw400('FORBIDDEN', '需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的分类ID')
  const body = await readJson<{ name?: string; description?: string; orderIndex?: number }>(req)
  const updated = await updateCategory(id, body)
  return ok(updated)
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw400('FORBIDDEN', '需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的分类ID')

  // 防御性：若有题单引用则禁止删除
  const used = await prisma.training.count({ where: { categoryId: id } })
  if (used > 0) {
    throw404('该分类仍有 ' + used + ' 个题单引用，无法删除')
  }
  await deleteCategory(id)
  return ok({ id })
})
