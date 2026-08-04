/**
 * tests/login-lockout-memory.test.ts
 * Redis 未配置时账号锁退化为进程内内存存储（单实例语义一致）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: fakePrisma }))

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => { throw new Error('should not call redis when unconfigured') },
  isRedisConfigured: () => false,
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  signToken: vi.fn().mockReturnValue('mock-jwt-token'),
}))

vi.mock('@/lib/error-monitor', () => ({
  errorMonitor: {
    trackError: vi.fn(),
    isBlockedAsync: vi.fn().mockResolvedValue(false),
    isBlocked: vi.fn().mockReturnValue(false),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    setContext: () => {},
  },
}))

import { loginUser, __resetMemoryLockStoreForTests } from '../lib/auth/login-service'
import bcrypt from 'bcryptjs'
const bcryptCompare = (bcrypt as any).compare as ReturnType<typeof vi.fn>

const fakeUser = {
  id: 'u1',
  username: 'alice',
  email: 'alice@example.com',
  password: 'hash',
  nickname: null,
  avatar: null,
  bio: null,
  rank: 'gray',
  color: '#999',
  role: 'USER',
  isBanned: false,
  tokenVersion: 0,
  createdAt: new Date(),
}

describe('loginUser - Redis 未配置（内存退化锁）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetMemoryLockStoreForTests()
    fakePrisma.user.findFirst.mockResolvedValue(fakeUser)
    bcryptCompare.mockResolvedValue(false)
  })

  it('连续失败 5 次后触发账号锁定（即使未配置 Redis）', async () => {
    // 前 4 次：仅记录失败
    for (let i = 0; i < 4; i++) {
      await expect(
        loginUser({ username: 'alice', password: 'wrong' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    // 第 5 次失败
    await expect(
      loginUser({ username: 'alice', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    // 第 6 次：应命中锁定（对外仍统一 UNAUTHORIZED，不区分锁定/密码错）
    await expect(
      loginUser({ username: 'alice', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('锁定计数按 userId 归一化（用户名/邮箱共享计数）', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        loginUser({ username: 'alice', password: 'wrong' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    // 用邮箱登录同样命中锁定
    await expect(
      loginUser({ username: 'alice@example.com', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('登录成功清空失败计数（内存锁解除）', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(
        loginUser({ username: 'alice', password: 'wrong' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    // 第 5 次成功（清空计数）
    bcryptCompare.mockResolvedValue(true)
    const result = await loginUser({ username: 'alice', password: 'right' })
    expect(result.user.id).toBe('u1')
    // 之后重新计数：再失败 5 次应再次锁定
    bcryptCompare.mockResolvedValue(false)
    for (let i = 0; i < 5; i++) {
      await expect(
        loginUser({ username: 'alice', password: 'wrong' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    // 现在应命中锁定
    await expect(
      loginUser({ username: 'alice', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
