/**
 * /api/training-categories - 题单分类
 *
 * GET  公开：分类列表
 * POST 鉴权：仅管理员可创建
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { listCategories, createCategory } from '@/lib/training/service'
import { canAccessAdmin } from '@/lib/permissions'

export const GET = withApi.public(async () => {
  const items = await listCategories()
  return ok({ items })
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (!canAccessAdmin(user)) {
    throw400('FORBIDDEN', '需要管理员权限')
  }
  const body = await readJson<{ name: string; description?: string; orderIndex?: number }>(req)
  if (!body.name) throw400('VALIDATION', '缺少 name')
  const created = await createCategory({
    name: body.name,
    description: body.description,
    orderIndex: body.orderIndex,
  })
  return ok(created, { status: 201 })
})
