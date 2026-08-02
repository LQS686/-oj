/**
 * 存量题解审核状态补齐脚本
 *
 * 背景：Solution 新增 status 字段（安全合规：发布前审核）。
 * MongoDB 中 @default 仅对新建文档生效，存量题解没有 status 字段，
 * 会导致审核过滤逻辑（status === 'approved'）将其视为不可见。
 * 本脚本把存量题解（无 status / status 为 null）统一置为 approved（已通过）。
 *
 * 部署时在 app 容器内执行：
 *   docker compose exec app node scripts/backfill-solution-status.mjs
 * 或本地（需 .env 指向目标库）：
 *   node scripts/backfill-solution-status.mjs
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  // MongoDB 中 { status: null } 匹配「字段缺失或为 null」的文档
  const updated = await prisma.solution.updateMany({
    where: { status: null },
    data: { status: 'approved' },
  })
  console.log(`已完成：补齐 ${updated.count} 条存量题解的审核状态为 approved（已通过）`)
  if (updated.count > 0) {
    console.log('提示：如这些题解中确有应下架/审核的内容，请到管理后台「题解审核」页处理。')
  }
}

main()
  .catch((err) => {
    console.error('迁移失败：', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
