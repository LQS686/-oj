/**
 * lib/user/auth-actions.ts
 * 邮箱修改、密码查询、角色标志、用户注册
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { clearUserCache } from './profile'

/* ============================================================================
 * 当前用户 email / password 修改（原 /api/users/profile/email 路由）
 * ========================================================================== */

export async function changeCurrentUserEmail(
  userId: string,
  newEmail: string
): Promise<{ email: string }> {
  if (!newEmail || typeof newEmail !== 'string') {
    throw AppError.badRequest('MISSING_EMAIL', '请提供新邮箱')
  }
  // 简单邮箱格式校验
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw AppError.badRequest('INVALID_EMAIL', '邮箱格式不正确')
  }
  const existing = await prisma.user.findUnique({ where: { email: newEmail } })
  if (existing && existing.id !== userId) {
    throw AppError.conflict('该邮箱已被使用')
  }
  await prisma.user.update({ where: { id: userId }, data: { email: newEmail } })
  clearUserCache(userId)
  return { email: newEmail }
}

/* ============================================================================
 * 用户邮箱修改 — 辅助函数（原 /api/users/profile/email）
 * ========================================================================== */

/** 读用户的 id/email/password 记录（用于密码校验 / 邮箱比较） */
export async function getUserWithPassword(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  })
}

/** 检查邮箱是否已被其他用户占用 */
export async function isEmailTaken(email: string, excludeUserId: string) {
  const u = await prisma.user.findUnique({ where: { email } })
  return !!(u && u.id !== excludeUserId)
}

/** 读用户角色位（role）— 用于题解鉴权 */
export async function getUserRoleFlags(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
}

/* ============================================================================
 * 注册流程（原 /api/auth/register）
 * ========================================================================== */

export interface RegisterResult {
  id: string
  username: string
  email: string
  nickname: string | null
  rating: number
  rank: string
  color: string
  role: string
  createdAt: Date
  isFirstUser: boolean
}

/** 注册新用户：检查重名/重邮箱 + 创建 + 返回 isFirstUser
 *
 * isFirstUser 由调用方传入（基于 prisma.user.count() === 0 判定），service 内部不读 DB 决定首用户
 *  - isFirstUser=true  → role=SYSTEM_ADMIN
 *  - isFirstUser=false → role=STUDENT
 */
export async function registerNewUser(input: {
  sanitizedUsername: string
  sanitizedEmail: string
  sanitizedNickname: string
  hashedPassword: string
  isFirstUser?: boolean
}): Promise<RegisterResult> {
  // 检查用户名
  const existingUsername = await prisma.user.findUnique({
    where: { username: input.sanitizedUsername },
  })
  if (existingUsername) {
    throw AppError.badRequest('BAD_REQUEST', '用户名已被使用')
  }
  // 检查邮箱
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.sanitizedEmail },
  })
  if (existingEmail) {
    throw AppError.badRequest('BAD_REQUEST', '邮箱已被注册')
  }

  const isFirstUser = input.isFirstUser === true

  let user
  try {
    user = await prisma.user.create({
      data: {
        username: input.sanitizedUsername,
        email: input.sanitizedEmail,
        password: input.hashedPassword,
        nickname: input.sanitizedNickname,
        rating: 1500,
        rank: isFirstUser ? '管理员' : '新手',
        color: isFirstUser ? '#FF6B6B' : '#808080',
        role: isFirstUser ? 'SYSTEM_ADMIN' : 'STUDENT',
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        rating: true,
        rank: true,
        color: true,
        role: true,
        createdAt: true,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // 唯一约束冲突：用户名或邮箱已被注册
      const target = err.meta?.target as string[] | undefined
      if (target?.includes('username')) {
        throw AppError.badRequest('BAD_REQUEST', '用户名已被使用')
      }
      if (target?.includes('email')) {
        throw AppError.badRequest('BAD_REQUEST', '邮箱已被注册')
      }
      throw AppError.badRequest('BAD_REQUEST', '用户名或邮箱已被使用')
    }
    throw err
  }

  // TOCTOU 防护：并发注册时，多个请求可能同时通过 count===0 判定。
  // 创建后二次校验 SYSTEM_ADMIN 数量，若 >1 说明已有更早的超管，将当前用户降级为 STUDENT。
  let actualRole = user.role
  let actualIsFirstUser = isFirstUser
  if (isFirstUser) {
    const adminCount = await prisma.user.count({ where: { role: 'SYSTEM_ADMIN' } })
    if (adminCount > 1) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'STUDENT', rank: '新手', color: '#808080' },
      })
      actualRole = 'STUDENT'
      actualIsFirstUser = false
    }
  }
  return { ...user, role: actualRole, isFirstUser: actualIsFirstUser }
}
