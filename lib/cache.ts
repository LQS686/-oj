export interface CacheOptions {
  ttl?: number // 缓存过期时间（毫秒）
  key?: string // 自定义缓存键
}

const MAX_CACHE_SIZE = 10000

class Cache {
  private storage: Map<string, { value: any; expiry: number }> = new Map()
  private cleanupInterval: NodeJS.Timeout
  // PERF-05 singleflight：缓存 miss 时去重并发同 key 回源请求
  private inflight: Map<string, Promise<any>> = new Map()

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
      this.cleanupInterval = null as any
    }
    this.storage.clear()
    this.inflight.clear()
  }

  /**
   * TODO: 多实例部署时应将 cache 后端改为 Redis 优先 + 内存 fallback
   * 当前为单进程内存缓存，多实例部署时各实例缓存独立
   */

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

  private generateKey(prefix: string, ...args: any[]): string {
    const serializedArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg)
      }
      return String(arg)
    }).join(':')
    return `${prefix}:${serializedArgs}`
  }

  async get<T>(prefix: string, args: any[], fn: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const key = options.key || this.generateKey(prefix, ...args)
    const now = Date.now()

    // 检查缓存是否存在且未过期
    const cached = this.storage.get(key)
    if (cached && cached.expiry > now) {
      // LRU：重新写入以标记为最近使用
      this.storage.delete(key)
      this.storage.set(key, cached)
      return cached.value
    }

    // PERF-05 singleflight：缓存 miss 时复用同 key 的 in-flight Promise，避免并发重复回源
    const inflightPromise = this.inflight.get(key)
    if (inflightPromise) {
      return inflightPromise as Promise<T>
    }

    // 发起新请求并登记 in-flight
    const promise = fn()
    this.inflight.set(key, promise)
    try {
      const value = await promise

      // 设置缓存（保持现有 LRU 与 MAX_CACHE_SIZE 检查）
      const ttl = options.ttl || 5 * 60 * 1000 // 默认5分钟
      this.evictIfNeeded()
      this.storage.set(key, {
        value,
        expiry: now + ttl
      })

      return value
    } finally {
      this.inflight.delete(key)
    }
  }

  set(key: string, value: any, ttl: number = 5 * 60 * 1000) {
    this.evictIfNeeded()
    this.storage.set(key, {
      value,
      expiry: Date.now() + ttl
    })
  }

  delete(key: string) {
    this.storage.delete(key)
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
    return count
  }

  clear() {
    this.storage.clear()
  }

  size(): number {
    return this.storage.size
  }
}

// 导出单例实例
export const cache = new Cache()
