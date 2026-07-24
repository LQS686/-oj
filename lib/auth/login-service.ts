import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { trimAll, escapeHtml, removeNullBytes } from '@/lib/sanitize'
import { validateRequired } from '@/lib/api/validation'
import { errorMonitor } from '@/lib/error-monitor'
import type { LoginResponse } from '@/lib/api/auth'
import { getRedisClient, isRedisConfigured } from '@/lib/redis'

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_SEC = 15 * 60

async function checkAccountLockout(usernameOrEmail: string): Promise<void> {
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  // 未配置 REDIS_URL 时不连 localhost，避免无效连接噪声
  if (!isRedisConfigured()) return
  try {
    const client = getRedisClient()
    const attempts = await client.get(key)
    if (attempts && parseInt(attempts, 10) >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await client.ttl(key)
      const minutes = Math.ceil((ttl > 0 ? ttl : LOCKOUT_DURATION_SEC) / 60)
      throw new LoginError(
        `登录失败次数过多，账号已临时锁定，请 ${minutes} 分钟后重试`,
        'ACCOUNT_LOCKED'
      )
    }
  } catch (e) {
    if (e instanceof LoginError) throw e
    logger.warn('Redis 不可用，跳过账号锁定检查', e)
  }
}

async function recordLoginFailure(usernameOrEmail: string): Promise<void> {
  if (!isRedisConfigured()) return
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  try {
    const client = getRedisClient()
    const multi = client.multi()
    multi.incr(key)
    multi.expire(key, LOCKOUT_DURATION_SEC)
    await multi.exec()
  } catch {
    logger.warn('Redis 不可用，跳过登录失败记录')
  }
}

async function clearLoginAttempts(usernameOrEmail: string): Promise<void> {
  if (!isRedisConfigured()) return
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  try {
    const client = getRedisClient()
    await client.del(key)
  } catch (e) {
    // 登录成功后清理失败不影响主流程，但需记录便于排查 Redis 连接问题
    logger.warn('Redis 不可用，跳过登录失败计数清理', e instanceof Error ? e : new Error(String(e)))
  }
}

export class LoginError extends Error {
  constructor(message: string, public code: string = 'AUTH_ERROR') {
    super(message)
    this.name = 'LoginError'
  }
}

export interface LoginInput {
  username: string
  password: string
}

export interface RegisterInput {
  username: string
  email: string
  password: string
  nickname?: string
}

export interface UserResponse {
  id: string
  username: string
  email: string
  nickname?: string
  avatar?: string
  bio?: string
  rating: number
  rank: string
  color: string
  role: string
  createdAt: string
}

function mapUserToResponse(user: any): UserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname ?? undefined,
    avatar: user.avatar ?? undefined,
    bio: user.bio ?? undefined,
    rating: user.rating,
    rank: user.rank,
    color: user.color,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function loginUser(input: LoginInput): Promise<LoginResponse> {
  try {
    const trimmedInput = trimAll(input as unknown as Record<string, unknown>)
    const { username, password } = trimmedInput as unknown as LoginInput

    const requiredError = validateRequired(trimmedInput, ['username', 'password'])
    if (requiredError) {
      logger.warn('登录尝试缺少字段', { input: trimmedInput })
      throw new LoginError('请输入用户名和密码', 'BAD_REQUEST')
    }

    const sanitizedUsername = removeNullBytes(escapeHtml(username))

    if (sanitizedUsername.length > 100) {
      logger.warn('登录尝试用户名过长', { usernameLength: sanitizedUsername.length })
      throw new LoginError('用户名格式不正确', 'BAD_REQUEST')
    }

    await checkAccountLockout(sanitizedUsername)

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: sanitizedUsername },
          { email: sanitizedUsername },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        nickname: true,
        avatar: true,
        bio: true,
        rating: true,
        rank: true,
        color: true,
        role: true,
        isBanned: true,
        tokenVersion: true,
        createdAt: true,
      },
    })

    if (!user) {
      logger.warn('登录失败: 用户不存在', { username: sanitizedUsername })
      await recordLoginFailure(sanitizedUsername)
      throw new LoginError('用户名或密码错误', 'UNAUTHORIZED')
    }

    if (user.isBanned) {
      logger.warn('登录被阻止: 用户被封禁', { userId: user.id, username: user.username })
      throw new LoginError('账号已被封禁', 'FORBIDDEN')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      logger.warn('登录失败: 密码错误', { userId: user.id, username: user.username })
      await recordLoginFailure(sanitizedUsername)
      throw new LoginError('用户名或密码错误', 'UNAUTHORIZED')
    }

    await clearLoginAttempts(sanitizedUsername)

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    })

    const userResponse = mapUserToResponse(user)

    logger.info('登录成功', { userId: user.id, username: user.username, role: user.role })
    return { user: userResponse, token }
  } catch (error) {
    if (error instanceof LoginError) throw error
    errorMonitor.trackError(error as Error, { errorType: 'auth', operation: 'login' })
    throw error
  }
}
