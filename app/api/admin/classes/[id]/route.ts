/**
 * /api/admin/classes/[id] - 管理员单个班级操作
 *
 * GET    班级详情
 * PATCH  更新班级信息
 * DELETE 删除班级
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminDeleteClass,
  adminUpdateClass,
  getClassDetail,
} from '@/lib/class/service'

/**
 * GET /api/admin/classes/[id] - 获取班级详情（管理员）
 */
export const GET = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const classData = await getClassDetail(id)
  if (!classData) throw404('班级不存在')
  return ok(classData)
})

/**
 * PATCH /api/admin/classes/[id] - 更新班级信息（管理员）
 * 支持字段：isPublic / name / description / announcement / avatar / maxMembers
 */
export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<{
    isPublic?: boolean
    name?: string
    description?: string | null
    announcement?: string | null
    avatar?: string | null
    maxMembers?: number
  }>(req)
  const { isPublic, name, description, announcement, avatar, maxMembers } = body

  if (
    isPublic === undefined &&
    name === undefined &&
    description === undefined &&
    announcement === undefined &&
    avatar === undefined &&
    maxMembers === undefined
  ) {
    throw400('INVALID_BODY', '请提供要更新的字段')
  }

  const message = await adminUpdateClass(id, {
    isPublic,
    name,
    description,
    announcement,
    avatar,
    maxMembers,
  })
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
