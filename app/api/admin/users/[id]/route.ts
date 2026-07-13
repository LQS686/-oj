/**
 * /api/admin/users/[id] - 单个用户的更新/删除（管理员）
 *
 * PATCH  更新用户权限、状态或重置密码
 * DELETE 删除用户
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminDeleteUser,
  adminUpdateUser,
  assertAssignableRole,
  assertCanDeleteUser,
  assertCanUpdateUser,
} from '@/lib/user/service'
import { isSystemAdmin } from '@/lib/permissions'
import * as bcrypt from 'bcryptjs'

/**
 * PATCH /api/admin/users/[id] - 更新用户权限、状态或重置密码（管理员）
 *
 * - role / isBanned：SYSTEM_ADMIN + ADMIN 均可操作（受 assertCanUpdateUser / assertAssignableRole 约束）
 * - password：仅 SYSTEM_ADMIN 可重置他人密码
 */
export const PATCH = withApi.admin(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  const body = await readJson<{
    role?: string
    isBanned?: boolean
    password?: string
  }>(req)

  // 校验：自己不能改 / 超级管理员不能改 / 管理员不能改其他管理员
  await assertCanUpdateUser(id, user.id, user.role, body)

  // 校验目标角色可被当前操作者分配（SYSTEM_ADMIN 不可被赋予；ADMIN 只能赋予 TEACHER/STUDENT）
  if (body.role !== undefined) {
    assertAssignableRole(body.role, user.role)
  }

  // 密码重置仅 SYSTEM_ADMIN 可操作
  if (body.password) {
    if (!isSystemAdmin(user)) {
      throw403('仅系统管理员可重置用户密码')
    }
  }

  const safeBody: {
    role?: 'ADMIN' | 'TEACHER' | 'STUDENT'
    isBanned?: boolean
    password?: string
  } = {
    isBanned: body.isBanned,
    password: body.password,
  }
  if (body.role !== undefined) {
    safeBody.role = body.role as 'ADMIN' | 'TEACHER' | 'STUDENT'
  }

  const updated = await adminUpdateUser(id, safeBody, bcrypt)
  return ok(updated)
})

/**
 * DELETE /api/admin/users/[id] - 删除用户（管理员）
 */
export const DELETE = withApi.admin(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  // 校验：不能删除自己 / 超级管理员不能删除 / 管理员不能删除其他管理员
  await assertCanDeleteUser(id, user.id, user.role)

  await adminDeleteUser(id)
  return ok({ message: '用户已删除' })
})
