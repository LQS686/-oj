/**
 * /api/admin/classes/[id] - 管理员单个班级操作
 *
 * PATCH  更新班级信息（可见性 / 名称 / 描述）
 * DELETE 删除班级
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminDeleteClass,
  adminUpdateClass,
} from '@/lib/class/service'

/**
 * PATCH /api/admin/classes/[id] - 更新班级信息（管理员）
 * 支持字段：isPublic / name / description，仅更新传入的字段
 */
export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{
    isPublic?: boolean
    name?: string
    description?: string | null
  }>(req)
  const { isPublic, name, description } = body

  if (isPublic === undefined && name === undefined && description === undefined) {
    throw400('INVALID_BODY', '请提供要更新的字段')
  }

  const message = await adminUpdateClass(id, { isPublic, name, description })
  return ok({ message })
})

/**
 * DELETE /api/admin/classes/[id] - 删除班级（管理员）
 */
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const message = await adminDeleteClass(id)
  return ok({ message })
})
