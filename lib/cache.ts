export interface CacheOptions {
  ttl?: number // 缓存过期时间（毫秒）
  key?: string // 自定义缓存键
}

const MAX_CACHE_SIZE = 10000

class Cache {
  private storage: Map<string, { value: any; expiry: number }> = new Map()
  private cleanupInterval: NodeJS.Timeout

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

    // 缓存不存在或已过期，执行函数获取新值
    const value = await fn()

    // 设置缓存
    const ttl = options.ttl || 5 * 60 * 1000 // 默认5分钟
    this.evictIfNeeded()
    this.storage.set(key, {
      value,
      expiry: now + ttl
    })

    return value
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
