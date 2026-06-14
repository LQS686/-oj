/**
 * /api/admin/classes/[id] - 管理员单个班级操作
 *
 * PATCH  更新班级可见性
 * DELETE 删除班级
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'
import {
  adminDeleteClass,
  adminUpdateClassVisibility,
} from '@/lib/class/service'

/**
 * PATCH /api/admin/classes/[id] - 更新班级可见性（管理员）
 */
export const PATCH = withApi.auth(withPermission('admin.access')(async (req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{ isPublic?: boolean }>(req)
  const { isPublic } = body

  const message = await adminUpdateClassVisibility(id, isPublic)
  return ok({ message })
}))

/**
 * DELETE /api/admin/classes/[id] - 删除班级（管理员）
 */
export const DELETE = withApi.auth(withPermission('admin.access')(async (_req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const message = await adminDeleteClass(id)
  return ok({ message })
}))
