/**
 * /api/admin/users/[id] - 单个用户的更新/删除（管理员）
 *
 * PATCH  更新用户权限、状态或重置密码
 * DELETE 删除用户
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

/**
 * PATCH /api/admin/users/[id] - 更新用户权限、状态或重置密码（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  const body = await readJson<{
    role?: string
    isAdmin?: boolean
    isBanned?: boolean
    password?: string
  }>(req)

  // 检查用户是否存在
  const targetUser = await prisma.user.findUnique({
    where: { id },
  })
  if (!targetUser) throw404('用户不存在')

  // 防止修改超级管理员
  if (targetUser!.isSuperAdmin) {
    throw403('超级管理员不可被修改')
  }

  // 防止管理员修改自己的管理员权限或封禁自己
  if (id === user.id) {
    if ('isAdmin' in body || 'isBanned' in body || 'role' in body) {
      throw400('CANNOT_MODIFY_SELF', '不能修改自己的权限或状态')
    }
  }

  // 准备更新数据
  const updateData: any = {}

  if ('role' in body) {
    const validRoles = ['ADMIN', 'TEACHER', 'USER']
    if (!validRoles.includes(body.role!)) {
      throw400('INVALID_ROLE', '无效的角色类型')
    }
    updateData.role = body.role
    updateData.isAdmin = body.role === 'ADMIN'
  }

  if ('isAdmin' in body) {
    updateData.isAdmin = Boolean(body.isAdmin)
  }

  if ('isBanned' in body) {
    updateData.isBanned = Boolean(body.isBanned)
  }

  if (body.password) {
    if (body.password.length < 6) {
      throw400('PASSWORD_TOO_SHORT', '密码长度至少为6位')
    }
    const hashedPassword = await bcrypt.hash(body.password, 10)
    updateData.password = hashedPassword
  }

  // 更新用户
  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      isAdmin: true,
      role: true,
      isBanned: true,
    },
  })

  return ok(updated)
})

/**
 * DELETE /api/admin/users/[id] - 删除用户（管理员）
 */
export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')

  // 防止删除自己
  if (id === user.id) {
    throw400('CANNOT_DELETE_SELF', '不能删除自己的账号')
  }

  // 检查用户是否存在
  const target = await prisma.user.findUnique({
    where: { id },
  })
  if (!target) throw404('用户不存在')

  // 防止删除超级管理员
  if (target!.isSuperAdmin) {
    throw403('超级管理员不可被删除')
  }

  // 删除用户（级联删除会自动删除相关数据）
  await prisma.user.delete({
    where: { id },
  })

  return ok({ message: '用户已删除' })
})
