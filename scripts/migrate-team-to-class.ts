/**
 * scripts/migrate-team-to-class.ts
 * MongoDB 数据迁移：team → class
 *
 * 幂等执行（已迁移的集合 / 字段会跳过）：
 * 1. renameCollection: team* → class* (Prisma MongoDB 集合名默认是 PascalCase 转 camelCase + 复数)
 * 2. $rename: 所有 teamId 字段 → classId
 * 3. 索引重建 (Prisma 启动时自动同步)
 *
 * 运行：DATABASE_URL=mongodb://localhost:27017/oj npx tsx scripts/migrate-team-to-class.ts
 */

import { MongoClient } from 'mongodb'

const MONGO_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/oj'
const DB_NAME = MONGO_URL.split('/').pop()?.split('?')[0] || 'oj'

// 旧模型名 → 新模型名（Prisma MongoDB 集合名：PascalCase → camelCase + 复数 + 小写）
const COLLECTION_RENAMES: Record<string, string> = {
  team: 'class',
  teammember: 'classmember',
  teamassignment: 'classassignment',
  teamassignmentsubmission: 'classassignmentsubmission',
  teamnote: 'classnote',
  teaminvite: 'classinvite',
  teamdirectinvite: 'classdirectinvite',
  teamjoinrequest: 'classjoinrequest',
}

// 包含 teamId 字段的集合
const COLLECTIONS_WITH_TEAM_ID = [
  'class',
  'classmember',
  'classassignment',
  'classassignmentsubmission',
  'classnote',
  'classinvite',
  'classdirectinvite',
  'classjoinrequest',
  'pointsaccount',
  'pointshistory',
  'pointsshopitem',
  'pointsexchange',
  'notereadhistory',
  'problem', // 题目也有 classId
]

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  console.log(`[migrate] connected to ${MONGO_URL} (db=${DB_NAME})`)
  const db = client.db(DB_NAME)

  const collections = await db.listCollections().toArray()
  const existingNames = new Set(collections.map(c => c.name))

  // ============ Step 1: renameCollection ============
  for (const [oldName, newName] of Object.entries(COLLECTION_RENAMES)) {
    if (existingNames.has(oldName) && !existingNames.has(newName)) {
      console.log(`[migrate] renameCollection: ${oldName} → ${newName}`)
      try {
        await db.admin().command({
          renameCollection: `${DB_NAME}.${oldName}`,
          to: `${DB_NAME}.${newName}`,
        })
      } catch (e: any) {
        console.warn(`[migrate] renameCollection failed for ${oldName}: ${e.message}`)
      }
    } else if (existingNames.has(newName)) {
      console.log(`[migrate] skip renameCollection: ${newName} already exists`)
    } else {
      console.log(`[migrate] skip renameCollection: ${oldName} not found (new DB or already renamed)`)
    }
  }

  // 刷新集合名
  const collectionsAfter = await db.listCollections().toArray()
  const namesAfter = new Set(collectionsAfter.map(c => c.name))

  // ============ Step 2: $rename teamId → classId ============
  for (const collName of COLLECTIONS_WITH_TEAM_ID) {
    if (!namesAfter.has(collName)) {
      continue
    }
    const coll = db.collection(collName)
    const sample = await coll.findOne({})
    if (!sample) continue
    if ('teamId' in sample) {
      const result = await coll.updateMany(
        { teamId: { $exists: true } },
        { $rename: { teamId: 'classId' } }
      )
      console.log(`[migrate] ${collName}: $rename teamId→classId, matched=${result.matchedCount}, modified=${result.modifiedCount}`)
    } else {
      console.log(`[migrate] ${collName}: already renamed or no teamId field`)
    }
  }

  // ============ Step 3: 重建索引 ============
  // Prisma 启动时会自动同步索引，但若需要手动重建：
  console.log('[migrate] index sync will be handled by Prisma on next start')
  console.log('[migrate] run `npx prisma db push` to ensure schema/index consistency')

  await client.close()
  console.log('[migrate] done')
}

main().catch(err => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
