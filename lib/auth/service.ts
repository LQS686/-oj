/**
 * lib/auth/service.ts
 * 认证与当前用户上下文服务
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'

export interface AuthUserInfo {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  role: string
  email: string | null
}

/**
 * 通过 ID 查询用户基础信息
 */
export async function findUserById(userId: string): Promise<AuthUserInfo | null> {
  return cache.get('auth:user', [userId], async () => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
        email: true,
      },
    })
    if (!u) return null
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      role: u.role || 'STUDENT',
      email: u.email,
    } satisfies AuthUserInfo
  }, { ttl: 60_000 })
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
