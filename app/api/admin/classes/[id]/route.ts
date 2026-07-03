/**
 * /api/admin/classes/[id] - 管理员单个班级操作
 *
 * PATCH  更新班级可见性
 * DELETE 删除班级
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminDeleteClass,
  adminUpdateClassVisibility,
} from '@/lib/class/service'

/**
 * PATCH /api/admin/classes/[id] - 更新班级可见性（管理员）
 */
export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{ isPublic?: boolean }>(req)
  const { isPublic } = body

  const message = await adminUpdateClassVisibility(id, isPublic)
  return ok({ message })
})

/**
 * DELETE /api/admin/classes/[id] - 删除班级（管理员）
 */
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const message = await adminDeleteClass(id)
  return ok({ message })
})
