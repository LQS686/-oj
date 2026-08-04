/**
 * lib/auth/service.ts
 * 认证与当前用户上下文服务（仅服务端）
 */
import 'server-only'

import { prisma } from '@/lib/prisma'

export interface AuthUserInfo {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  role: string
  email: string | null
}

/**
 * 通过邮箱查询
 */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

/**
 * 通过用户名查询
 */
export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } })
}

/**
 * 验证密码（已用 bcrypt 散列）
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.compare(plain, hash)
}

/**
 * 哈希密码
 */
export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.hash(plain, 10)
}
