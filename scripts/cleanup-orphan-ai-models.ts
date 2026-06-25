/**
 * 一次性清理脚本：清空 AiModel 与 UserAiPreference
 *
 * 背景：
 *   之前版本的清理脚本只过滤"挂载在已禁用 Provider 上的"模型，
 *   但实际数据库中仍可能存在 provider 处于 active 状态、model 也处于
 *   active 状态的历史脏数据，导致前端 AI 出题页仍展示残留的模型 ID。
 *
 * 使用：
 *   1) 先 dry-run 模式查看数据库实际状态：
 *        npx tsx scripts/cleanup-orphan-ai-models.ts --dry-run
 *   2) 确认后实际清空所有 AiModel + 关联 UserAiPreference：
 *        npx tsx scripts/cleanup-orphan-ai-models.ts --force
 */

import { prisma } from '../lib/prisma'

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

async function main() {
  console.log('========================================')
  console.log(' AiModel 清理脚本')
  console.log(` 模式: ${FORCE ? '强制清空' : DRY_RUN ? '诊断' : '诊断（加 --force 实际清空）'}`)
  console.log('========================================\n')

  // 1) 列出所有 AiProvider
  const allProviders = await prisma.aiProvider.findMany({
    orderBy: { createdAt: 'asc' }
  })
  console.log(`[1] 当前数据库共有 ${allProviders.length} 个 AiProvider：`)
  if (allProviders.length === 0) {
    console.log('    (无)\n')
  } else {
    allProviders.forEach((p: any) => {
      console.log(`    - [${p.id}] name="${p.name}" slug="${p.slug}" isActive=${p.isActive}`)
    })
    console.log()
  }

  // 2) 列出所有 AiModel（无论 isActive）
  const allModels = await prisma.aiModel.findMany({
    orderBy: { createdAt: 'asc' }
  })
  console.log(`[2] 当前数据库共有 ${allModels.length} 个 AiModel：`)
  if (allModels.length === 0) {
    console.log('    (无)\n')
  } else {
    const providerMap = new Map<any, any>(allProviders.map((p: any) => [p.id, p]))
    allModels.forEach((m: any) => {
      const provider = providerMap.get(m.providerId)
      const providerStatus = provider
        ? `挂载在 [${provider.slug || provider.id}] isActive=${provider.isActive}`
        : '⚠️  孤儿(providerId 不存在)'
      console.log(
        `    - [${m.id}] name="${m.name}" model="${m.model}" type="${m.type}" ` +
        `isActive=${m.isActive} | ${providerStatus}`
      )
    })
    console.log()
  }

  // 3) 列出 UserAiPreference 中引用了多少 model
  const prefCount = await prisma.userAiPreference.count()
  console.log(`[3] 当前数据库共有 ${prefCount} 条 UserAiPreference 记录\n`)

  // 4) 决定是否清空
  if (allModels.length === 0) {
    console.log('没有 AiModel 记录，无需清理。')
    return
  }

  if (DRY_RUN || !FORCE) {
    console.log('当前为诊断模式，未修改任何数据。')
    console.log('若要清空所有 AiModel + 关联 UserAiPreference，请执行：')
    console.log('    npx tsx scripts/cleanup-orphan-ai-models.ts --force')
    return
  }

  // 5) 实际清空
  console.log('开始强制清空…')

  const prefDel = await prisma.userAiPreference.deleteMany({
    where: { modelId: { in: allModels.map((m: any) => m.id) } }
  })
  console.log(`  - 已删除 ${prefDel.count} 条 UserAiPreference 记录`)

  const modelDel = await prisma.aiModel.deleteMany({})
  console.log(`  - 已删除 ${modelDel.count} 条 AiModel 记录`)

  console.log('\n清空完成。请重启 dev server 并刷新页面。')
}

main()
  .catch((e) => {
    console.error('清理脚本执行失败：', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
