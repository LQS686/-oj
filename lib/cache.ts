import { logger } from './logger'
import { isRedisConfigured } from './redis'

export interface CacheOptions {
  ttl?: number // 缓存过期时间（毫秒）
  key?: string // 自定义缓存键
}

const MAX_CACHE_SIZE = 10000
const REDIS_KEY_PREFIX = 'appcache:'

/** Redis JSON 标记：避免 Date 被 toJSON 成裸 ISO 字符串后无法还原 */
const DATE_TAG = '__dsoj_date__'

/** 在 JSON.stringify 之前把 Date 打成标签（Date.toJSON 会抢先变成字符串，replacer 接不到 Date） */
function tagDatesForRedis(value: unknown): unknown {
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() }
  }
  if (Array.isArray(value)) {
    return value.map(tagDatesForRedis)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = tagDatesForRedis(v)
    }
    return out
  }
  return value
}

function redisReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    DATE_TAG in (value as Record<string, unknown>)
  ) {
    const iso = (value as Record<string, unknown>)[DATE_TAG]
    if (typeof iso === 'string') {
      const d = new Date(iso)
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return value
}

class Cache {
  private storage: Map<string, { value: unknown; expiry: number }> = new Map()
  private cleanupInterval: NodeJS.Timeout
  // PERF-05 singleflight：缓存 miss 时去重并发同 key 回源请求
  private inflight: Map<string, Promise<unknown>> = new Map()
  private redis: import('ioredis').default | null = null
  private redisInit: Promise<boolean> | null = null

  constructor() {
    // 每5分钟清理一次过期缓存
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, { expiry }] of this.storage.entries()) {
      if (expiry < now) {
        this.storage.delete(key)
      }
    }
  }

  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null as unknown as NodeJS.Timeout
    }
    this.storage.clear()
    this.inflight.clear()
  }

  /**
   * 多实例：REDIS_URL 可用时 Redis 优先，内存作为本进程 L1。
   * 未配置 REDIS_URL 时仅内存（单实例 / 本地开发）。
   */
  private async ensureRedis(): Promise<boolean> {
    if (!isRedisConfigured()) return false
    if (this.redis) return true
    if (this.redisInit) return this.redisInit

    this.redisInit = (async () => {
      try {
        const { getRedisClient } = await import('./redis')
        const client = getRedisClient()
        await client.ping()
        this.redis = client
        return true
      } catch (error) {
        logger.warn('[cache] Redis 不可用，降级为内存缓存', {
          error: error instanceof Error ? error.message : String(error),
        })
        this.redis = null
        return false
      } finally {
        this.redisInit = null
      }
    })()

    return this.redisInit
  }

  private redisKey(key: string): string {
    return `${REDIS_KEY_PREFIX}${key}`
  }

  /**
   * LRU 淘汰：容量超限时移除最久未使用的条目。
   * Map 按插入顺序遍历，首项即最旧。get/set 时重新写入以更新顺序。
   */
  private evictIfNeeded() {
    while (this.storage.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.storage.keys().next().value
      if (oldestKey === undefined) break
      this.storage.delete(oldestKey)
    }
  }

  private generateKey(prefix: string, ...args: unknown[]): string {
    const serializedArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg)
      }
      return String(arg)
    }).join(':')
    return `${prefix}:${serializedArgs}`
  }

  private setMemory(key: string, value: unknown, ttlMs: number) {
    this.evictIfNeeded()
    this.storage.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    })
  }

  private async setRedis(key: string, value: unknown, ttlMs: number) {
    if (!(await this.ensureRedis()) || !this.redis) return
    try {
      const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000))
      await this.redis.set(
        this.redisKey(key),
        JSON.stringify(tagDatesForRedis(value)),
        'EX',
        ttlSec
      )
    } catch (error) {
      logger.warn('[cache] Redis set 失败', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async getRedis<T>(key: string): Promise<T | undefined> {
    if (!(await this.ensureRedis()) || !this.redis) return undefined
    try {
      const raw = await this.redis.get(this.redisKey(key))
      if (raw == null) return undefined
      return JSON.parse(raw, redisReviver) as T
    } catch (error) {
      logger.warn('[cache] Redis get 失败', {
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  async get<T>(prefix: string, args: unknown[], fn: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const key = options.key || this.generateKey(prefix, ...args)
    const now = Date.now()
    const ttl = options.ttl || 5 * 60 * 1000

    // L1 内存
    const cached = this.storage.get(key)
    if (cached && cached.expiry > now) {
      this.storage.delete(key)
      this.storage.set(key, cached)
      return cached.value as T
    }

    // L2 Redis（多实例共享）
    const fromRedis = await this.getRedis<T>(key)
    if (fromRedis !== undefined) {
      this.setMemory(key, fromRedis, ttl)
      return fromRedis
    }

    // PERF-05 singleflight：缓存 miss 时复用同 key 的 in-flight Promise，避免并发重复回源
    const inflightPromise = this.inflight.get(key)
    if (inflightPromise) {
      return inflightPromise as Promise<T>
    }

    const promise = fn()
    this.inflight.set(key, promise)
    try {
      const value = await promise
      this.setMemory(key, value, ttl)
      await this.setRedis(key, value, ttl)
      return value
    } finally {
      this.inflight.delete(key)
    }
  }

  set(key: string, value: unknown, ttl: number = 5 * 60 * 1000) {
    this.setMemory(key, value, ttl)
    void this.setRedis(key, value, ttl)
  }

  delete(key: string) {
    this.storage.delete(key)
    void this.deleteRedis(key)
  }

  private async deleteRedis(key: string) {
    if (!(await this.ensureRedis()) || !this.redis) return
    try {
      await this.redis.del(this.redisKey(key))
    } catch (error) {
      logger.warn('[cache] Redis delete 失败', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * 按前缀删除所有匹配 key（用于批量缓存失效）
   * 例：cache.deleteByPrefix('ranking:list') 会删除 ranking:list:xxx 所有 key
   */
  deleteByPrefix(prefix: string): number {
    let count = 0
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix + ':') || key === prefix) {
        this.storage.delete(key)
        count++
      }
    }
    void this.deleteRedisByPrefix(prefix)
    return count
  }

  private async deleteRedisByPrefix(prefix: string) {
    if (!(await this.ensureRedis()) || !this.redis) return
    try {
      const pattern = `${REDIS_KEY_PREFIX}${prefix}*`
      let cursor = '0'
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = next
        if (keys.length > 0) {
          await this.redis.del(...keys)
        }
      } while (cursor !== '0')
    } catch (error) {
      logger.warn('[cache] Redis deleteByPrefix 失败', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  clear() {
    this.storage.clear()
    void this.clearRedisAll()
  }

  private async clearRedisAll() {
    if (!(await this.ensureRedis()) || !this.redis) return
    try {
      const pattern = `${REDIS_KEY_PREFIX}*`
      let cursor = '0'
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = next
        if (keys.length > 0) {
          await this.redis.del(...keys)
        }
      } while (cursor !== '0')
    } catch (error) {
      logger.warn('[cache] Redis clear 失败', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  size(): number {
    return this.storage.size
  }
}

// 导出单例实例
export const cache = new Cache()
