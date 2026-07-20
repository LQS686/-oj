/**
 * MongoDB 客户端管理
 * 提供主库/只读客户端连接、连接池配置和自动重试机制
 *
 * 其他直操作模块（submission-direct / assignment-direct / contest-direct）
 * 通过 `import { getMongoClient, withRetry } from './client'` 复用本模块的能力。
 */

import { MongoClient, ReadPreference, WriteConcern } from 'mongodb'
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

/**
 * 执行带重试的数据库操作
 * @param operation 数据库操作函数
 * @param retries 重试次数
 */
export async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await operation()
  } catch (error: any) {
    if (retries > 0 && (
      error.name === 'MongoNetworkError' ||
      error.name === 'MongoTimeoutError' ||
      error.code === 10107 // NotWritablePrimary
    )) {
      logger.warn(`Database operation failed, retrying... (${retries} attempts left)`, { error: error.message })
      await new Promise(resolve => setTimeout(resolve, 1000)) // 等待1秒后重试
      // 如果是因为主节点变更导致的连接失效，尝试清除缓存
      if (error.code === 10107) {
         cachedClient = null;
      }
      return withRetry(operation, retries - 1)
    }
    throw error
  }
}
