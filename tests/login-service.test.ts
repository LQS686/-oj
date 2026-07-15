/**
 * tests/login-service.test.ts
 * 登录服务核心逻辑单元测试（P1：核心模块回归保护）
 *
 * 注：
 *   1. loginUser 内部调用 prisma + redis + bcrypt，本测试通过 vi.mock 隔离这些依赖。
 *   2. 只测试"业务规则"：参数校验、锁定检查、密码校验、成功登录、清理。
 *   3. 不测试真实 DB 行为（E2E 由 supertest 测试覆盖）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 隔离 prisma：让 prisma.user.findFirst 返回我们控制的 fakeUser
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: fakePrisma }))

// 隔离 redis：返回 mock client
const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    multi: vi.fn(),
    eval: vi.fn(),
  },
}))

const mockMulti = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}
mockRedis.multi.mockReturnValue(mockMulti)
mockRedis.ttl.mockResolvedValue(900)

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => mockRedis,
}))

// 隔离 bcrypt：固定返回 true / false
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

import { loginUser, LoginError } from '../lib/auth/login-service'
import bcrypt from 'bcryptjs'
const bcryptCompare = (bcrypt as any).compare as ReturnType<typeof vi.fn>

describe('loginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 redis lockout key 不存在（无锁定）
    mockRedis.get.mockResolvedValue(null)
    mockMulti.exec.mockResolvedValue([])
  })

  it('应抛出 LoginError(BAD_REQUEST) 当缺 username', async () => {
    await expect(
      loginUser({ username: '', password: 'pwd123' })
    ).rejects.toThrow(LoginError)
    await expect(
      loginUser({ username: '', password: 'pwd123' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('应抛出 LoginError(BAD_REQUEST) 当缺 password', async () => {
    await expect(
      loginUser({ username: 'alice', password: '' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('应抛出 LoginError(BAD_REQUEST) 当 username 长度 > 100', async () => {
    const longName = 'a'.repeat(101)
    await expect(
      loginUser({ username: longName, password: 'pwd123' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('应抛出 LoginError(ACCOUNT_LOCKED) 当 lockout 计数 ≥ 5', async () => {
    mockRedis.get.mockResolvedValue('5')
    mockRedis.ttl.mockResolvedValue(300)
    await expect(
      loginUser({ username: 'alice', password: 'pwd123' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' })
  })

  it('应抛出 LoginError(UNAUTHORIZED) 当用户不存在', async () => {
    fakePrisma.user.findFirst.mockResolvedValue(null)
    await expect(
      loginUser({ username: 'ghost', password: 'pwd123' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    // 验证失败被记录
    expect(mockMulti.incr).toHaveBeenCalled()
  })

  it('应抛出 LoginError(FORBIDDEN) 当用户被封禁', async () => {
    fakePrisma.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'banned', email: 'b@b.com', password: 'hash',
      nickname: null, avatar: null, bio: null, rating: 0, rank: 'gray',
      color: '#999', role: 'USER', isBanned: true, tokenVersion: 0,
      createdAt: new Date(),
    })
    await expect(
      loginUser({ username: 'banned', password: 'pwd123' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('应抛出 LoginError(UNAUTHORIZED) 当密码错误', async () => {
    fakePrisma.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'alice', email: 'a@a.com', password: 'hash',
      nickname: null, avatar: null, bio: null, rating: 0, rank: 'gray',
      color: '#999', role: 'USER', isBanned: false, tokenVersion: 0,
      createdAt: new Date(),
    })
    bcryptCompare.mockResolvedValue(false)
    await expect(
      loginUser({ username: 'alice', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mockMulti.incr).toHaveBeenCalled()
  })

  it('应返回 user + token 当登录成功', async () => {
    fakePrisma.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'alice', email: 'a@a.com', password: 'hash',
      nickname: 'Alice', avatar: 'https://img/a.png', bio: 'hi',
      rating: 1500, rank: 'green', color: '#0f0',
      role: 'SYSTEM_ADMIN', isBanned: false, tokenVersion: 1,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    })
    bcryptCompare.mockResolvedValue(true)
    const result = await loginUser({ username: 'alice', password: 'pwd123' })
    expect(result.token).toBe('mock-jwt-token')
    expect(result.user.id).toBe('u1')
    expect(result.user.username).toBe('alice')
    expect(result.user.role).toBe('SYSTEM_ADMIN')
    // tokenVersion 不应出现在 UserResponse 中（内部安全字段）
    expect('tokenVersion' in result.user).toBe(false)
    // 登录成功应清空失败计数
    expect(mockRedis.del).toHaveBeenCalled()
  })

  it('应允许通过 email 登录', async () => {
    fakePrisma.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'alice', email: 'a@a.com', password: 'hash',
      nickname: null, avatar: null, bio: null, rating: 0, rank: 'gray',
      color: '#999', role: 'USER', isBanned: false, tokenVersion: 0,
      createdAt: new Date(),
    })
    bcryptCompare.mockResolvedValue(true)
    const result = await loginUser({ username: 'a@a.com', password: 'pwd123' })
    expect(result.user.username).toBe('alice')
  })

  it('应剥离 username 中的 HTML 转义字符（XSS 防护）', async () => {
    fakePrisma.user.findFirst.mockResolvedValue(null)
    await expect(
      loginUser({ username: '<script>alert(1)</script>', password: 'pwd' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    // findFirst 的 username 应该是转义后的（不含原始 HTML）
    const callArgs = fakePrisma.user.findFirst.mock.calls[0][0]
    expect(callArgs.where.OR[0].username).not.toContain('<script>')
  })

  it('应剥离 username 中的 NUL 字节', async () => {
    fakePrisma.user.findFirst.mockResolvedValue(null)
    await expect(
      loginUser({ username: 'alice\u0000admin', password: 'pwd' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const callArgs = fakePrisma.user.findFirst.mock.calls[0][0]
    expect(callArgs.where.OR[0].username).not.toContain('\u0000')
  })

  it('Redis 不可用时应降级（不阻塞登录）', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis down'))
    fakePrisma.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'alice', email: 'a@a.com', password: 'hash',
      nickname: null, avatar: null, bio: null, rating: 0, rank: 'gray',
      color: '#999', role: 'USER', isBanned: false, tokenVersion: 0,
      createdAt: new Date(),
    })
    bcryptCompare.mockResolvedValue(true)
    // 即便 redis 抛错也不应阻塞登录（只 warn）
    const result = await loginUser({ username: 'alice', password: 'pwd' })
    expect(result.user.username).toBe('alice')
  })
})