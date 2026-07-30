/**
 * lib/user/auth-actions.ts
 * 邮箱修改、密码查询、角色标志、用户注册
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { errorLike } from '@/lib/api/errors'
import { clearUserCache } from './profile'

/** 旧邮箱保留期：期内不可被他人注册或抢注 */
export const EMAIL_HOLD_MS = 30 * 24 * 60 * 60 * 1000

export async function isEmailInHoldPeriod(email: string, excludeUserId?: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - EMAIL_HOLD_MS)
  const hit = await prisma.user.findFirst({
    where: {
      previousEmail: email.toLowerCase(),
      emailChangedAt: { gte: cutoff },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  })
  return !!hit
}

export async function changeCurrentUserEmail(
  userId: string,
  newEmail: string
): Promise<{ email: string }> {
  if (!newEmail || typeof newEmail !== 'string') {
    throw AppError.badRequest('MISSING_EMAIL', '请提供新邮箱')
  }
  const normalized = newEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw AppError.badRequest('INVALID_EMAIL', '邮箱格式不正确')
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })
  if (!current) throw AppError.notFound('用户不存在')
  if (current.email === normalized) {
    return { email: normalized }
  }

  const existing = await prisma.user.findUnique({ where: { email: normalized } })
  if (existing && existing.id !== userId) {
    throw AppError.conflict('该邮箱已被使用')
  }
  if (await isEmailInHoldPeriod(normalized, userId)) {
    throw AppError.conflict('该邮箱处于改绑冷却期，暂时不可使用')
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalized,
      previousEmail: current.email,
      emailChangedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  })
  clearUserCache(userId)
  return { email: normalized }
}

export async function getUserWithPassword(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  })
}

export async function isEmailTaken(email: string, excludeUserId: string) {
  const normalized = email.toLowerCase()
  const u = await prisma.user.findUnique({ where: { email: normalized } })
  if (u && u.id !== excludeUserId) return true
  return isEmailInHoldPeriod(normalized, excludeUserId)
}

export async function getUserRoleFlags(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
}

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

/**
 * 注册新用户。首用户 SYSTEM_ADMIN 在事务内按 count===0 原子判定，消除 TOCTOU。
 */
export async function registerNewUser(input: {
  sanitizedUsername: string
  sanitizedEmail: string
  sanitizedNickname: string
  hashedPassword: string
  isFirstUser?: boolean
}): Promise<RegisterResult> {
  const email = input.sanitizedEmail.toLowerCase()

  const existingUsername = await prisma.user.findUnique({
    where: { username: input.sanitizedUsername },
  })
  if (existingUsername) {
    throw AppError.badRequest('BAD_REQUEST', '用户名已被使用')
  }
  const existingEmail = await prisma.user.findUnique({ where: { email } })
  if (existingEmail) {
    throw AppError.badRequest('BAD_REQUEST', '邮箱已被注册')
  }
  if (await isEmailInHoldPeriod(email)) {
    throw AppError.badRequest('BAD_REQUEST', '该邮箱处于改绑冷却期，暂时不可注册')
  }

  let user
  try {
    user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count()
      const isFirstUser = count === 0
      return tx.user.create({
        data: {
          username: input.sanitizedUsername,
          email,
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
    })
  } catch (err: unknown) {
    const e = errorLike(err)
    if (e.code === 'P2002') {
      const target = (err as { meta?: { target?: string[] } } | null)?.meta?.target
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

  return { ...user, isFirstUser: user.role === 'SYSTEM_ADMIN' }
}
