/**
 * MongoDB 客户端管理
 * 提供主库/只读客户端连接、连接池配置和自动重试机制
 *
 * 其他直操作模块（submission-direct / assignment-direct / contest-direct）
 * 通过 `import { getMongoClient, withRetry } from './client'` 复用本模块的能力。
 */

import { MongoClient, ReadPreference } from 'mongodb'
import { logger } from '@/lib/logger'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    // 构建阶段跳过（next build 时 NEXT_PHASE=phase-production-build）
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return 'mongodb://localhost:27017/oj_platform'
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 DATABASE_URL 环境变量')
    }
  }
  return url || 'mongodb://localhost:27017/oj_platform?replicaSet=rs0'
}
const MONGODB_URI = getDatabaseUrl()

// 缓存客户端实例
let cachedClient: MongoClient | null = null
let cachedRoClient: MongoClient | null = null

// 连接配置选项
const clientOptions = {
  minPoolSize: 5,
  maxPoolSize: 50,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true, // 自动重试写操作
}

/**
 * 获取主库 MongoDB 客户端连接 (Write / Strong Read)
 * WriteConcern: Majority (确保数据写入大多数节点)
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient
  }

  const client = new MongoClient(MONGODB_URI, {
    ...clientOptions,
    writeConcern: { w: 'majority', wtimeout: 5000 },
    readPreference: ReadPreference.PRIMARY,
  })

  await client.connect()
  cachedClient = client
  return client
}

/**
 * 获取只读 MongoDB 客户端连接 (Eventual Consistency Read)
 * ReadPreference: SecondaryPreferred (优先读从库)
 */
export async function getMongoRoClient(): Promise<MongoClient> {
  if (cachedRoClient) {
    return cachedRoClient
  }

  // 构造只读连接字符串或选项
  // 注意：在 MongoClient 选项中设置 readPreference 优于在 URL 中设置
  const client = new MongoClient(MONGODB_URI, {
    ...clientOptions,
    readPreference: ReadPreference.SECONDARY_PREFERRED,
  })

  await client.connect()
  cachedRoClient = client
  return client
}

/**
 * 关闭 MongoDB 客户端连接（供 server.ts 优雅关闭调用）
 * 仅清理本模块缓存的客户端；Prisma 维护自己的连接池，由 prisma.$disconnect() 关闭
 */
export async function closeMongoClient(): Promise<void> {
  const clients = [cachedClient, cachedRoClient].filter((c): c is MongoClient => c !== null)
  cachedClient = null
  cachedRoClient = null
  if (clients.length === 0) return
  await Promise.allSettled(clients.map((c) => c.close()))
  logger.info('MongoDB 客户端连接已关闭')
}

export type WithRetryOptions = {
  /**
   * 仅对幂等操作开启网络/主节点切换重试。
   * insert / $inc 等非幂等写默认不重试，避免重复主键或双计。
   */
  idempotent?: boolean
}

/**
 * 执行带重试的数据库操作（默认不重试；幂等操作显式传 idempotent: true）
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  options: WithRetryOptions = {}
): Promise<T> {
  try {
    return await operation()
  } catch (error: unknown) {
    const err = error as { name?: string; code?: number; message?: string }
    const mayRetry =
      options.idempotent === true &&
      retries > 0 &&
      (err.name === 'MongoNetworkError' ||
        err.name === 'MongoTimeoutError' ||
        err.code === 10107) // NotWritablePrimary

    if (mayRetry) {
      logger.warn(`Database operation failed, retrying... (${retries} attempts left)`, {
        error: err.message,
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (err.code === 10107) {
        cachedClient = null
      }
      return withRetry(operation, retries - 1, options)
    }
    throw error
  }
}
