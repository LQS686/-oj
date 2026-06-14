/**
 * scripts/migrate-permission.ts
 * 一次性数据迁移：把旧 isAdmin / isSuperAdmin / role 字符串归一为新 SYSTEM_ADMIN / TEACHER / STUDENT
 *
 * 规则：
 *   - isSuperAdmin=true                              → role='SYSTEM_ADMIN'
 *   - isAdmin=true && isSuperAdmin=false             → role='TEACHER'
 *   - 其他                                           → role='STUDENT'
 *
 * 不删除 isAdmin 字段（保留兼容），只更新 role 字段
 *
 * 运行：DATABASE_URL=mongodb://localhost:27017/oj npx tsx scripts/migrate-permission.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type NewRole = 'SYSTEM_ADMIN' | 'TEACHER' | 'STUDENT'

function mapOldToNewRole(args: {
  isSuperAdmin: boolean
  isAdmin: boolean
  oldRole: string | null
}): NewRole {
  if (args.isSuperAdmin) return 'SYSTEM_ADMIN'
  if (args.isAdmin) return 'TEACHER'
  // 兼容旧 role 字符串：ADMIN（历史脏数据）→ TEACHER
  if (args.oldRole === 'ADMIN' || args.oldRole === 'SUPER_ADMIN') return 'TEACHER'
  return 'STUDENT'
}

async function main() {
  console.log('[migrate-permission] 读取所有 User...')

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      isAdmin: true,
      isSuperAdmin: true,
    },
  })

  console.log(`[migrate-permission] 共 ${users.length} 个用户，开始评估...`)

  const stats: Record<NewRole, number> = {
    SYSTEM_ADMIN: 0,
    TEACHER: 0,
    STUDENT: 0,
  }

  for (const u of users) {
    const newRole = mapOldToNewRole({
      isSuperAdmin: u.isSuperAdmin,
      isAdmin: u.isAdmin,
      oldRole: u.role,
    })

    const before = `role='${u.role}', isAdmin=${u.isAdmin}, isSuperAdmin=${u.isSuperAdmin}`
    const after = `role='${newRole}'`

    if (u.role !== newRole) {
      await prisma.user.update({
        where: { id: u.id },
        data: { role: newRole },
      })
      console.log(`[migrate-permission] ${u.username} (${u.id}): ${before}  →  ${after}`)
    } else {
      console.log(`[migrate-permission] ${u.username} (${u.id}): ${before}  =  ${after}（无需更新）`)
    }

    stats[newRole]++
  }

  console.log('')
  console.log('[migrate-permission] 统计：')
  console.log(`  SYSTEM_ADMIN = ${stats.SYSTEM_ADMIN}`)
  console.log(`  TEACHER      = ${stats.TEACHER}`)
  console.log(`  STUDENT      = ${stats.STUDENT}`)
  console.log('')
  console.log(`迁移完成：1 个 SYSTEM_ADMIN（若有）, ${stats.TEACHER} 个 TEACHER, ${stats.STUDENT} 个 STUDENT`)
}

main()
  .catch((err) => {
    console.error('[migrate-permission] 执行失败：', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
