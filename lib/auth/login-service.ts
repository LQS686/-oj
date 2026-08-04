/**
 * lib/auth/login-service.ts
 * 登录：账号锁定 + 密码校验 + 签发 JWT（仅用于 Cookie）
 */
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { trimAll, removeNullBytes } from '@/lib/sanitize'
import { validateRequired } from '@/lib/api/validation'
import { errorMonitor } from '@/lib/error-monitor'
import { getRedisClient, isRedisConfigured } from '@/lib/redis'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_SEC = 15 * 60

/**
 * 账号锁内存退化存储（REDIS_URL 未配置时使用）：
 * 与 Redis 版保持相同语义（次数 + 过期），避免单实例部署时账号锁定静默失效。
 * 注意：多实例部署下内存锁不共享，生产仍应配置 Redis。
 */
const memoryLockStore = new Map<string, { count: number; expiresAt: number }>()
const MEMORY_LOCK_MAX_ENTRIES = 5000

function memoryLockGet(key: string): number {
  const entry = memoryLockStore.get(key)
  if (!entry) return 0
  if (entry.expiresAt < Date.now()) {
    memoryLockStore.delete(key)
    return 0
  }
  return entry.count
}

function memoryLockIncr(key: string): number {
  const now = Date.now()
  const entry = memoryLockStore.get(key)
  const next = entry && entry.expiresAt >= now
    ? { count: entry.count + 1, expiresAt: entry.expiresAt }
    : { count: 1, expiresAt: now + LOCKOUT_DURATION_SEC * 1000 }
  memoryLockStore.set(key, next)
  // LRU 上限保护：防止攻击者用随机用户名撑爆内存
  if (memoryLockStore.size > MEMORY_LOCK_MAX_ENTRIES) {
    const oldest = [...memoryLockStore.keys()].slice(0, memoryLockStore.size - MEMORY_LOCK_MAX_ENTRIES)
    for (const k of oldest) memoryLockStore.delete(k)
  }
  return next.count
}

function memoryLockDelete(key: string): void {
  memoryLockStore.delete(key)
}

/**
 * 仅供测试使用：清空内存锁存储，避免模块级单例跨测试污染。
 * 生产代码不调用。
 */
export function __resetMemoryLockStoreForTests(): void {
  memoryLockStore.clear()
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

export interface UserResponse {
  id: string
  username: string
  email: string
  nickname?: string
  avatar?: string
  bio?: string
  rank: string
  color: string
  role: string
  createdAt: string
}

/** 服务端登录结果：token 仅用于写 Cookie，不下发响应体 */
export interface LoginResult {
  user: UserResponse
  token: string
}

async function checkAccountLockout(usernameOrEmail: string): Promise<void> {
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  if (!isRedisConfigured()) {
    // Redis 未配置：退化到进程内内存锁（单实例语义一致）
    const attempts = memoryLockGet(key)
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      logger.warn('账号已锁定（内存退化存储），拒绝登录', {
        usernameOrEmail,
        attempts,
        lockoutMinutes: LOCKOUT_DURATION_SEC / 60,
      })
      throw new LoginError('用户名或密码错误', 'UNAUTHORIZED')
    }
    return
  }
  try {
    const client = getRedisClient()
    const attempts = await client.get(key)
    if (attempts && parseInt(attempts, 10) >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await client.ttl(key)
      const minutes = Math.ceil((ttl > 0 ? ttl : LOCKOUT_DURATION_SEC) / 60)
      // A-P2-5：真实锁定原因仅记日志，对外统一为「用户名或密码错误」，避免通过锁定提示枚举账号存在性
      logger.warn('账号已锁定，拒绝登录', {
        usernameOrEmail,
        attempts: parseInt(attempts, 10),
        lockoutMinutes: minutes,
        key,
      })
      throw new LoginError(
        '用户名或密码错误',
        'UNAUTHORIZED'
      )
    }
  } catch (e) {
    if (e instanceof LoginError) throw e
    logger.error('Redis 不可用，拒绝登录（账号锁定检查失败）', e)
    throw new LoginError('登录服务暂时不可用，请稍后重试', 'AUTH_UNAVAILABLE')
  }
}

async function recordLoginFailure(usernameOrEmail: string): Promise<void> {
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  if (!isRedisConfigured()) {
    memoryLockIncr(key)
    return
  }
  try {
    const client = getRedisClient()
    const multi = client.multi()
    multi.incr(key)
    multi.expire(key, LOCKOUT_DURATION_SEC)
    await multi.exec()
  } catch (e) {
    logger.error('Redis 不可用，无法记录登录失败次数', e)
  }
}

async function clearLoginAttempts(usernameOrEmail: string): Promise<void> {
  const key = `auth:lockout:${usernameOrEmail.toLowerCase()}`
  if (!isRedisConfigured()) {
    memoryLockDelete(key)
    return
  }
  try {
    const client = getRedisClient()
    await client.del(key)
  } catch (e) {
    logger.warn('Redis 不可用，跳过登录失败计数清理', e instanceof Error ? e : new Error(String(e)))
  }
}

function mapUserToResponse(user: {
  id: string
  username: string
  email: string
  nickname: string | null
  avatar: string | null
  bio: string | null
  rank: string
  color: string
  role: string
  createdAt: Date
}): UserResponse {
  const avatar = sanitizeAvatarUrl(user.avatar)
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname ?? undefined,
    avatar: avatar ?? undefined,
    bio: user.bio ?? undefined,
    rank: user.rank,
    color: user.color,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function loginUser(input: LoginInput): Promise<LoginResult> {
  try {
    const trimmedInput = trimAll(input as unknown as Record<string, unknown>)
    const { username, password } = trimmedInput as unknown as LoginInput

    const requiredError = validateRequired(trimmedInput, ['username', 'password'])
    if (requiredError) {
      throw new LoginError('请输入用户名和密码', 'BAD_REQUEST')
    }

    const sanitizedUsername = removeNullBytes(String(username).trim())
    if (sanitizedUsername.length < 1 || sanitizedUsername.length > 100) {
      throw new LoginError('用户名格式不正确', 'BAD_REQUEST')
    }

    if (await errorMonitor.isBlockedAsync('auth')) {
      throw new LoginError('登录暂时受限，请稍后再试', 'RATE_LIMITED')
    }

    // 先查用户再检查锁定：锁定计数按 userId 归一化，
    // 避免同一账号交替用用户名/邮箱各失败 5 次绕过锁定（合计 10 次不触发）
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: sanitizedUsername }, { email: sanitizedUsername }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        nickname: true,
        avatar: true,
        bio: true,
        rank: true,
        color: true,
        role: true,
        isBanned: true,
        tokenVersion: true,
        createdAt: true,
      },
    })
    // 用户存在时用 userId 作锁定 key（双标识符共享计数）；
    // 不存在时退化为输入标识符（防止对同一字符串高频尝试）
    const lockKey = user ? user.id : sanitizedUsername.toLowerCase()
    await checkAccountLockout(lockKey)

    if (!user) {
      await recordLoginFailure(lockKey)
      throw new LoginError('用户名或密码错误', 'UNAUTHORIZED')
    }

    if (user.isBanned) {
      throw new LoginError('账号已被封禁', 'FORBIDDEN')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      await recordLoginFailure(lockKey)
      throw new LoginError('用户名或密码错误', 'UNAUTHORIZED')
    }

    await clearLoginAttempts(lockKey)

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    })

    return { user: mapUserToResponse(user), token }
  } catch (error) {
    if (error instanceof LoginError) throw error
    errorMonitor.trackError(error as Error, { errorType: 'auth', operation: 'login' })
    throw error
  }
}
