import { PrismaClient, Prisma } from '@prisma/client'

export { Prisma }

// 定义全局类型以防止开发环境热重载导致的多实例问题
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaRo: PrismaClient | undefined
}

// 基础数据库 URL
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须设置 DATABASE_URL 环境变量')
  }
  return url || "mongodb://localhost:27017/oj_platform?replicaSet=rs0"
}
const dbUrl = getDatabaseUrl()

// 主库客户端配置（写操作 + 强一致性读）
// 增加连接池参数 maxPoolSize 和 connectTimeoutMS
const primaryUrl = dbUrl.includes('?') 
  ? `${dbUrl}&maxPoolSize=50&connectTimeoutMS=5000` 
  : `${dbUrl}?maxPoolSize=50&connectTimeoutMS=5000`

// 从库客户端配置（最终一致性读）
// 显式设置 readPreference=secondaryPreferred
const roUrl = dbUrl.includes('?')
  ? `${dbUrl}&readPreference=secondaryPreferred&maxPoolSize=50&connectTimeoutMS=5000`
  : `${dbUrl}?readPreference=secondaryPreferred&maxPoolSize=50&connectTimeoutMS=5000`

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: primaryUrl
    }
  },
  // 可以在这里添加日志配置
  // log: ['query', 'info', 'warn', 'error'],
})

export const prismaRo = globalForPrisma.prismaRo ?? new PrismaClient({
  datasources: {
    db: {
      url: roUrl
    }
  },
  // log: ['warn', 'error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaRo = prismaRo
}

