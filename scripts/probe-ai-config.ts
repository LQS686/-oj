/**
 * 探测数据库：找一个有 AI 配置的用户，跑 e2e
 * 输出 JSON 到 stdout
 */

import { config as dotenvConfig } from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenvConfig({ path: path.resolve(__dirname, '..', '.env'), quiet: true })
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true })

import { prisma } from '../lib/prisma'

async function main() {
  // 1. 找 GLOBAL 配置
  const global = await prisma.aiModelConfig.findFirst({ where: { scope: 'GLOBAL' } })
  console.log('GLOBAL config:', global ? { id: global.id, provider: global.provider, model: global.model } : 'NOT_FOUND')

  // 2. 找任意 active model
  const model = await prisma.aiModel.findFirst({
    where: { isActive: true },
    include: { provider: true }
  })
  console.log('Active model:', model ? { id: model.id, name: model.name, model: model.model, provider: model.provider.slug, isActive: model.isActive, providerActive: model.provider.isActive } : 'NOT_FOUND')

  // 3. 找 userAiPreference
  const pref = await prisma.userAiPreference.findFirst({
    orderBy: { lastUsed: 'desc' }
  })
  console.log('User pref:', pref ? { userId: pref.userId, modelId: pref.modelId } : 'NOT_FOUND')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
