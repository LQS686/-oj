/**
 * tests/redis-config.test.ts
 * isRedisConfigured：多实例 cache / rate-limit 是否启用 Redis 的开关
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('isRedisConfigured', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('REDIS_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('未设置 REDIS_URL 时返回 false', async () => {
    const { isRedisConfigured } = await import('../lib/redis')
    expect(isRedisConfigured()).toBe(false)
  })

  it('设置 REDIS_URL 时返回 true', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    const { isRedisConfigured } = await import('../lib/redis')
    expect(isRedisConfigured()).toBe(true)
  })

  it('仅空白 REDIS_URL 时返回 false', async () => {
    vi.stubEnv('REDIS_URL', '   ')
    const { isRedisConfigured } = await import('../lib/redis')
    expect(isRedisConfigured()).toBe(false)
  })
})
