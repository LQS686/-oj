/**
 * tests/env.test.ts
 * 环境变量校验单元测试（P1-3：集中校验后的回归保护）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 每个用例都重置 module 缓存，确保 env.ts 顶部逻辑重新执行
function reloadEnv() {
  vi.resetModules()
  // 抑制 logger 副作用
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
  const ORIGINAL = { ...process.env }

  beforeEach(() => {
    // 清理所有相关变量（用 Reflect.deleteProperty 绕过 readonly 限制）
    for (const k of ['JWT_SECRET', 'DATABASE_URL', 'NODE_ENV', 'FRONTEND_URL']) {
      Reflect.deleteProperty(process.env, k)
    }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL }
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
    process.env.JWT_SECRET = 'a'.repeat(48)
    const { checkEnvironment } = await import('../lib/env')
    const result = checkEnvironment()
    expect(result.missing).toContain('DATABASE_URL')
  })

  it('checkEnvironment 在有完整必填项时返回 ok=true', async () => {
    reloadEnv()
    process.env.JWT_SECRET = 'a'.repeat(48)
    process.env.DATABASE_URL = 'mongodb://localhost:27017/test'
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
    process.env.JWT_SECRET = 'a'.repeat(48)
    process.env.DATABASE_URL = 'http://localhost:5432'
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).toThrow(/mongodb/)
  })

  it('validateEnvironment 在 JWT_SECRET 长度 < 32 时 throw', async () => {
    reloadEnv()
    process.env.JWT_SECRET = 'short'
    process.env.DATABASE_URL = 'mongodb://localhost:27017/test'
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).toThrow(/长度不足/)
  })

  it('validateEnvironment 多次调用只校验一次（幂等）', async () => {
    reloadEnv()
    process.env.JWT_SECRET = 'a'.repeat(48)
    process.env.DATABASE_URL = 'mongodb://localhost:27017/test'
    const { validateEnvironment } = await import('../lib/env')
    expect(() => validateEnvironment()).not.toThrow()
    expect(() => validateEnvironment()).not.toThrow()
  })
})