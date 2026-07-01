/**
 * scripts/migrate-class-member-roles.ts
 * 一次性迁移：ClassMember.role 历史脏数据 → 数据库存储规范
 *
 * 规范（与 lib/class/roles.ts 一致）：
 *   owner     → owner（不变）
 *   admin     → admin（不变）
 *   member    → member（不变）
 *   assistant → admin   （曾错误写入 API 值）
 *   teacher   → owner   （若存在旧语义）
 *   student   → member
 *
 * 运行（先预览）：
 *   npx tsx scripts/migrate-class-member-roles.ts --dry-run
 *
 * 正式执行：
 *   npx tsx scripts/migrate-class-member-roles.ts
 *
 * 需配置 DATABASE_URL（与 prisma 相同）
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const TARGET: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  assistant: 'admin',
  teacher: 'owner',
  student: 'member',
}

function normalizeDbRole(raw: string): string | null {
  const next = TARGET[raw]
  if (!next) return null
  return next === raw ? null : next
}

async function main() {
  console.log(`[migrate-class-member-roles] ${dryRun ? '【预览模式，不写库】' : '开始写入…'}`)

  const members = await prisma.classMember.findMany({
    select: {
      id: true,
      classId: true,
      userId: true,
      role: true,
    },
  })

  console.log(`[migrate-class-member-roles] 共 ${members.length} 条 ClassMember`)

  let updated = 0
  let skipped = 0
  let unknown = 0
  const byFrom: Record<string, number> = {}

  for (const m of members) {
    const next = normalizeDbRole(m.role)
    if (next === null) {
      if (!TARGET[m.role]) {
        unknown++
        console.warn(
          `[migrate-class-member-roles] 未知 role="${m.role}" id=${m.id} classId=${m.classId} userId=${m.userId}（跳过）`
        )
      } else {
        skipped++
      }
      continue
    }

    byFrom[m.role] = (byFrom[m.role] || 0) + 1
    console.log(
      `[migrate-class-member-roles] ${m.userId} @ ${m.classId}: "${m.role}" → "${next}"`
    )

    if (!dryRun) {
      await prisma.classMember.update({
        where: { id: m.id },
        data: { role: next },
      })
    }
    updated++
  }

  console.log('')
  console.log('[migrate-class-member-roles] 统计：')
  console.log(`  需迁移: ${updated}`)
  console.log(`  已规范无需改: ${skipped}`)
  console.log(`  未知 role: ${unknown}`)
  if (Object.keys(byFrom).length) {
    console.log('  按原值：')
    for (const [from, n] of Object.entries(byFrom)) {
      console.log(`    ${from} → ${TARGET[from]} : ${n} 条`)
    }
  }
  if (dryRun && updated > 0) {
    console.log('')
    console.log('预览结束。确认无误后去掉 --dry-run 再执行一次。')
  } else if (!dryRun) {
    console.log('')
    console.log('[migrate-class-member-roles] 迁移完成。')
  }
}

main()
  .catch((err) => {
    console.error('[migrate-class-member-roles] 执行失败：', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })