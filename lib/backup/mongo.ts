/**
 * lib/backup/mongo.ts
 * 备份/恢复专用 MongoDB 原生客户端。
 *
 * 为什么不用 Prisma？备份需要遍历「全部集合」（含 Prisma 未映射的），
 * 并以 EJSON 保真导出 _id/ObjectId/Date 等类型，原生驱动更合适。
 * 连接串直接复用 DATABASE_URL，避免为备份单引一套。
 */
import 'server-only'
import { MongoClient, type Db } from 'mongodb'

const globalForMongo = globalThis as unknown as {
  backupMongoClient?: MongoClient
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return 'mongodb://localhost:27017/oj_platform'
    }
    throw new Error('备份引擎缺少 DATABASE_URL')
  }
  return url
}

function getDbName(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\//, '')
    if (path) return path
  } catch {
    /* fallthrough to default */
  }
  return 'oj_platform'
}

export async function getBackupDb(): Promise<Db> {
  const url = getDatabaseUrl()
  const dbName = getDbName(url)
  if (!globalForMongo.backupMongoClient) {
    globalForMongo.backupMongoClient = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 10_000,
    })
  }
  const client = globalForMongo.backupMongoClient
  // mongodb 驱动 v7 已移除 isConnected；驱动会在首次操作时自动建立连接
  return client.db(dbName)
}

/** 与引擎共享的闭站连接（测试/工具用） */
export async function closeBackupMongo(): Promise<void> {
  await globalForMongo.backupMongoClient?.close()
  globalForMongo.backupMongoClient = undefined
}
