import Redis from 'ioredis'
import { logger } from './logger'

let redisClient: Redis | null = null

function getRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须设置 REDIS_URL 环境变量')
  }
  return url || 'redis://localhost:6379'
}

function createRedisClient(): Redis {
  const redisUrl = getRedisUrl()
  
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    connectTimeout: 10000,
    keepAlive: 30000
  })

  client.on('error', (error) => {
    logger.error('Redis connection error:', error)
  })

  client.on('connect', () => {
    logger.info('Redis connected successfully')
  })

  client.on('reconnecting', () => {
    logger.info('Redis reconnecting...')
  })

  client.on('end', () => {
    logger.info('Redis connection closed')
  })

  return client
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient()
  }
  return redisClient
}

export interface RedisCacheOptions {
  ttl?: number // 缓存过期时间（秒）
  prefix?: string // 缓存键前缀
}

class RedisCache {
  private client: Redis

  constructor() {
    this.client = getRedisClient()
  }

  async get<T>(key: string, options: RedisCacheOptions = {}): Promise<T | null> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    try {
      const value = await this.client.get(fullKey)
      if (value) {
        return JSON.parse(value)
      }
      return null
    } catch (error) {
      logger.error('Redis get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T, options: RedisCacheOptions = {}): Promise<boolean> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    const ttl = options.ttl || 300 // 默认5分钟
    try {
      await this.client.set(fullKey, JSON.stringify(value), 'EX', ttl)
      return true
    } catch (error) {
      logger.error('Redis set error:', error)
      return false
    }
  }

  async delete(key: string, options: RedisCacheOptions = {}): Promise<boolean> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    try {
      await this.client.del(fullKey)
      return true
    } catch (error) {
      logger.error('Redis delete error:', error)
      return false
    }
  }

  async exists(key: string, options: RedisCacheOptions = {}): Promise<boolean> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    try {
      const result = await this.client.exists(fullKey)
      return result > 0
    } catch (error) {
      logger.error('Redis exists error:', error)
      return false
    }
  }

  async increment(key: string, options: RedisCacheOptions = {}): Promise<number | null> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    try {
      return await this.client.incr(fullKey)
    } catch (error) {
      logger.error('Redis increment error:', error)
      return null
    }
  }

  async decrement(key: string, options: RedisCacheOptions = {}): Promise<number | null> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key
    try {
      return await this.client.decr(fullKey)
    } catch (error) {
      logger.error('Redis decrement error:', error)
      return null
    }
  }

  async keys(pattern: string, options: RedisCacheOptions = {}): Promise<string[]> {
    const fullPattern = options.prefix ? `${options.prefix}:${pattern}` : pattern
    try {
      return await this.client.keys(fullPattern)
    } catch (error) {
      logger.error('Redis keys error:', error)
      return []
    }
  }

  async clear(pattern: string, options: RedisCacheOptions = {}): Promise<boolean> {
    const fullPattern = options.prefix ? `${options.prefix}:${pattern}` : pattern
    try {
      const keys = await this.client.keys(fullPattern)
      if (keys.length > 0) {
        await this.client.del(...keys)
      }
      return true
    } catch (error) {
      logger.error('Redis clear error:', error)
      return false
    }
  }
}

// 导出单例实例
export const redisCache = new RedisCache()
