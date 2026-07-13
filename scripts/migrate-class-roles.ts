/**
 * 数据库迁移：ClassMember.role 旧值 → 新值
 *   admin  → assistant
 *   member → student
 *   owner  → owner（不变）
 *
 * 用法:
 *   npx tsx scripts/migrate-class-roles.ts
 *   DATABASE_URL=mongodb://... npx tsx scripts/migrate-class-roles.ts
 */
import { MongoClient, ObjectId } from 'mongodb'

const url = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj_platform'

async function main() {
  const client = new MongoClient(url)

  try {
    await client.connect()
    const db = client.db()
    const collection = db.collection('ClassMember')

    const total = await collection.countDocuments()
    console.log(`ClassMember 总数: ${total}`)

    if (total === 0) {
      console.log('无数据需要迁移')
      return
    }

    const resultAdmin = await collection.updateMany(
      { role: 'admin' },
      { $set: { role: 'assistant' } }
    )
    console.log(`admin → assistant: ${resultAdmin.modifiedCount} 条已更新`)

    const resultMember = await collection.updateMany(
      { role: 'member' },
      { $set: { role: 'student' } }
    )
    console.log(`member → student: ${resultMember.modifiedCount} 条已更新`)

    const verification = await collection.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray()

    console.log('\n迁移后角色分布:')
    for (const row of verification) {
      console.log(`  ${row._id}: ${row.count}`)
    }

    console.log('\n迁移完成')
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('迁移失败:', err)
  process.exit(1)
})
