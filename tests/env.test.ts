/**
 * tests/env.test.ts
 * 环境变量校验单元测试（P1-3：集中校验后的回归保护）
 *
 * 注意：不可依赖 Reflect.deleteProperty(process.env)，在已加载 .env 的环境下
 * 可能删不掉；统一用 vi.stubEnv 覆盖为空串，checkJwtSecret 将空串视为缺失。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function reloadEnv() {
  vi.resetModules()
  vi.doMock('../lib/logger', () => ({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      setContext: () => {},
    },
  }))
}

describe('env', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', '')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('FRONTEND_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('checkEnvironment 在缺少 JWT_SECRET 时应报告 missing', async () => {
    reloadEnv()
    const { checkEnvironment } = await import('../lib/env')
    const result = checkEnvironment()
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('JWT_SECRET')
  })

  it('checkEnvironment 在缺少 DATABASE_URL 时应报告 missing', async () => {
    reloadEnv()
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48))
    const { checkEnvironment } = await import('../lib/env')
    const result = checkEnvironment()
    expect(result.missing).toContain('DATABASE_URL')
  })

  it('checkEnvironment 在有完整必填项时返回 ok=true', async () => {
    reloadEnv()
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48))
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/test')
    const { checkEnvironment } = await import('../lib/env')
    const result = checkEnvironment()
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('validateEnvironment 在 JWT_SECRET 缺失时 throw', async () => {
    reloadEnv()
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).toThrow(/JWT_SECRET/)
  })

  it('validateEnvironment 在 DATABASE_URL 非 mongodb 协议时 throw', async () => {
    reloadEnv()
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48))
    vi.stubEnv('DATABASE_URL', 'http://localhost:5432')
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).toThrow(/mongodb/)
  })

  it('validateEnvironment 在 JWT_SECRET 长度 < 32 时 throw', async () => {
    reloadEnv()
    vi.stubEnv('JWT_SECRET', 'short')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/test')
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).toThrow(/长度不足/)
  })

  it('validateEnvironment 多次调用只校验一次（幂等）', async () => {
    reloadEnv()
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48))
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/test')
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).not.toThrow()
    expect(() => validateEnvironment()).not.toThrow()
  })
})
