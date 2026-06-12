/**
 * 一次性数据修复脚本：把所有题目的测试点分数归一化到总和 100
 *
 * 适用场景：
 *  - 历史 AI 生成的题（每点 score=10，5 点 → 总分 50）
 *  - 历史上传测试点（每点 score=10）
 *  - 任何"未经过 ensureTotalScoreIs100"的存量数据
 *
 * 用法：
 *   npx tsx scripts/normalize-test-case-scores.ts                # 预览（不写库）
 *   npx tsx scripts/normalize-test-case-scores.ts --force        # 实际修复
 *
 * 实现：
 *  1. 扫描所有 Problem 的 TestCase
 *  2. 对每个问题，若 sum(testCases.score) != 100 → 均分重算
 *  3. 写出数据库
 */

import { prisma } from '../lib/prisma'
import { distributeTestCaseScores, ensureTotalScoreIs100, assertTotalScoreIs100 } from '../lib/problem/testcase'

const FORCE = process.argv.includes('--force')

async function main() {
  console.log('========================================')
  console.log('测试点分数据修复脚本')
  console.log(`模式: ${FORCE ? '【执行】' : '【预览】不写库（传 --force 实际修复）'}`)
  console.log('========================================\n')

  // 1. 加载所有题目 + 它们的 testCases
  const problems = await prisma.problem.findMany({
    include: {
      testCases: {
        orderBy: { orderIndex: 'asc' }
      }
    }
  })

  console.log(`扫描到 ${problems.length} 道题目\n`)

  let toFixCount = 0
  let okCount = 0
  let emptyCount = 0
  const fixes: Array<{ problemId: string; problemNumber: string; title: string; oldTotal: number; newScores: number[] }> = []

  for (const p of problems) {
    if (!p.testCases || p.testCases.length === 0) {
      emptyCount++
      continue
    }
    const total = p.testCases.reduce((s, tc) => s + (tc.score || 0), 0)
    if (total === 100) {
      okCount++
      continue
    }
    toFixCount++
    const newCases = ensureTotalScoreIs100(
      p.testCases.map((tc) => ({ id: tc.id, score: tc.score }))
    )
    const newScores = newCases.map((tc: any) => tc.score)
    fixes.push({
      problemId: p.id,
      problemNumber: p.problemNumber ?? '(无题号)',
      title: p.title,
      oldTotal: total,
      newScores
    })
  }

  console.log(`已合规（总分=100）：${okCount} 道`)
  console.log(`无测试点：${emptyCount} 道`)
  console.log(`需修复：${toFixCount} 道\n`)

  if (fixes.length === 0) {
    console.log('🎉 没有需要修复的题目')
    return
  }

  console.log('修复清单（前 20）：')
  for (const f of fixes.slice(0, 20)) {
    console.log(`  - ${f.problemNumber} ${f.title}`)
    console.log(`    旧总分: ${f.oldTotal}  →  新分数: [${f.newScores.join(', ')}]（和=${f.newScores.reduce((a, b) => a + b, 0)}）`)
  }
  if (fixes.length > 20) {
    console.log(`  ... 还有 ${fixes.length - 20} 道省略`)
  }
  console.log('')

  if (!FORCE) {
    console.log('⚠️  当前为预览模式，未写库')
    console.log('   实际修复请传 --force：')
    console.log('   npx tsx scripts/normalize-test-case-scores.ts --force')
    return
  }

  console.log('开始执行修复...')
  let success = 0
  let failed = 0
  for (const f of fixes) {
    try {
      // 逐点 update（避免 createMany 触发校验）
      const newCases = ensureTotalScoreIs100(
        (await prisma.testCase.findMany({ where: { problemId: f.problemId } })).map((tc) => ({
          id: tc.id,
          score: tc.score
        }))
      )
      for (const nc of newCases) {
        await prisma.testCase.update({
          where: { id: nc.id },
          data: { score: nc.score }
        })
      }
      // 验证
      const updated = await prisma.testCase.findMany({ where: { problemId: f.problemId } })
      const total = updated.reduce((s, tc) => s + (tc.score || 0), 0)
      if (total === 100) {
        success++
        console.log(`  ✅ ${f.problemNumber} (new total: ${total})`)
      } else {
        failed++
        console.log(`  ❌ ${f.problemNumber} (still ${total}, expected 100)`)
      }
    } catch (e: any) {
      failed++
      console.log(`  ❌ ${f.problemNumber} ERROR: ${e?.message}`)
    }
  }
  console.log(`\n========================================`)
  console.log(`完成: 成功 ${success} / 失败 ${failed} / 总 ${fixes.length}`)
  console.log(`========================================`)
}

main()
  .catch(e => {
    console.error('FATAL:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
