/**
 * /api/admin/users/[id] - 单个用户的更新/删除（管理员）
 *
 * PATCH  更新用户权限、状态或重置密码
 * DELETE 删除用户
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'
import {
  adminDeleteUser,
  adminUpdateUser,
  assertCanDeleteUser,
  assertCanUpdateUser,
} from '@/lib/user/service'
import * as bcrypt from 'bcryptjs'

/**
 * PATCH /api/admin/users/[id] - 更新用户权限、状态或重置密码（管理员）
 */
export const PATCH = withApi.auth(withPermission('admin.access')(async (req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  const body = await readJson<{
    role?: string
    isAdmin?: boolean
    isBanned?: boolean
    password?: string
  }>(req)

  // 校验：自己不能改 / 超级管理员不能改
  await assertCanUpdateUser(id, user.id, body)

  // narrow role 到合法 union
  const validRoles = ['SYSTEM_ADMIN', 'TEACHER', 'STUDENT'] as const
  type ValidRole = (typeof validRoles)[number]
  const safeBody: {
    role?: ValidRole
    isAdmin?: boolean
    isBanned?: boolean
    password?: string
  } = {
    isAdmin: body.isAdmin,
    isBanned: body.isBanned,
    password: body.password,
  }
  if (body.role && (validRoles as readonly string[]).includes(body.role)) {
    safeBody.role = body.role as ValidRole
  }

  const updated = await adminUpdateUser(id, safeBody, bcrypt)
  return ok(updated)
}))

/**
 * DELETE /api/admin/users/[id] - 删除用户（管理员）
 */
export const DELETE = withApi.auth(withPermission('admin.access')(async (_req, ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  // 校验：不能删除自己 / 超级管理员不能删除
  await assertCanDeleteUser(id, user.id)

  await adminDeleteUser(id)
  return ok({ message: '用户已删除' })
}))
