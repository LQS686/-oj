/**
 * 一次性迁移脚本：移除权限点系统遗留数据
 *
 * 清空以下 MongoDB 集合（对应已从 Prisma schema 移除的模型）：
 * - Permission（权限点定义）
 * - RolePermission（角色权限关联）
 * - UserPermission（用户级权限覆盖）
 *
 * 使用方式：npx tsx scripts/migrate-remove-permissions.ts
 *
 * 选项：
 *   --dry-run  仅预览将删除的文档数，不实际删除
 *   --drop     删除文档后同时 dropCollection（删除集合本身）
 *
 * 说明：
 *   这三张表已从 prisma/schema.prisma 移除，PrismaClient 无法访问，
 *   因此本脚本直接使用 MongoClient 操作原始集合（集合名为模型名 PascalCase，
 *   与 seed.ts 一致）。
 */

import { MongoClient } from 'mongodb'
import { logger } from '../lib/logger'

const url = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj_platform'

// 需要清空的集合（Prisma MongoDB 集合名 = 模型名 PascalCase）
const TARGET_COLLECTIONS = ['Permission', 'RolePermission', 'UserPermission']

const dryRun = process.argv.includes('--dry-run')
const dropCollections = process.argv.includes('--drop')

async function main() {
  logger.info('========================================')
  logger.info(' 移除权限点系统遗留数据')
  logger.info(
    ` 模式: ${dryRun ? '预览（不写库）' : '执行删除'}${dropCollections ? ' + dropCollection' : ''}`
  )
  logger.info('========================================')

  const client = new MongoClient(url)

  try {
    await client.connect()
    logger.info(`已连接到 MongoDB: ${url}`)

    const db = client.db()

    for (const name of TARGET_COLLECTIONS) {
      const collection = db.collection(name)

      // 统计当前文档数（集合不存在时 countDocuments 返回 0）
      let before = 0
      try {
        before = await collection.countDocuments()
      } catch (e: any) {
        // 集合不存在时 countDocuments 不会抛错，但保险起见捕获
        logger.warn(`统计 ${name} 文档数失败：${e?.message || e}（视为 0）`)
      }

      logger.info(`[${name}] 当前文档数：${before}`)

      if (before === 0) {
        logger.info(`[${name}] 无数据，跳过。`)
        continue
      }

      if (dryRun) {
        logger.info(`[${name}] 预览模式：将删除 ${before} 条文档（不实际执行）。`)
        continue
      }

      // 1) 删除所有文档
      const result = await collection.deleteMany({})
      logger.info(`[${name}] 已删除 ${result.deletedCount} 条文档。`)

      // 2) 可选：删除集合本身
      if (dropCollections) {
        try {
          await db.dropCollection(name)
          logger.info(`[${name}] 已 dropCollection（集合已删除）。`)
        } catch (e: any) {
          // 集合不存在时 dropCollection 会抛错，忽略即可
          logger.warn(`[${name}] dropCollection 失败：${e?.message || e}（可忽略，集合可能已不存在）`)
        }
      }
    }

    logger.info('----------------------------------------')
    if (dryRun) {
      logger.info('预览结束。确认无误后去掉 --dry-run 重新执行。')
    } else {
      logger.info('权限点系统遗留数据清理完成。')
    }
    logger.info('----------------------------------------')
  } catch (error) {
    logger.error('迁移脚本执行失败：', error)
    process.exit(1)
  } finally {
    await client.close()
    logger.info('已断开 MongoDB 连接')
  }
}

main()
