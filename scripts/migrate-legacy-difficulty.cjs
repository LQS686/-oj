/**
 * 一次性数据迁移：将题目表中的旧难度档位改为洛谷 8 档。
 * 用法：node scripts/migrate-legacy-difficulty.cjs
 *
 * 部署去掉 UI/导入旧档兼容前应先跑本脚本。跑完后仓库内不再做运行时旧档映射。
 * 映射：简单→普及-，中等→普及，困难→提高；英文 easy/medium/hard 同理。
 */
const { PrismaClient } = require('@prisma/client')

const MAP = {
  简单: '普及-',
  中等: '普及',
  困难: '提高',
  easy: '入门',
  medium: '普及',
  hard: '提高',
  Easy: '入门',
  Medium: '普及',
  Hard: '提高',
}

async function main() {
  const prisma = new PrismaClient()
  let total = 0
  try {
    for (const [from, to] of Object.entries(MAP)) {
      const r = await prisma.problem.updateMany({
        where: { difficulty: from },
        data: { difficulty: to },
      })
      if (r.count > 0) {
        console.log(`${from} → ${to}: ${r.count}`)
        total += r.count
      }
    }
    console.log(`done, updated ${total} problems`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
