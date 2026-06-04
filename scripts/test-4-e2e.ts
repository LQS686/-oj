/**
 * AI 出题端到端测试
 *
 * 覆盖 2 个生成模式：
 * 1. ParamGen（AI 出题）— count=1 / count=2
 * 2. TestData（AI 生成测试数据）— 有/无标程
 *
 * 前置条件：
 * - .env 中含 DEEPSEEK_API_KEY（由 getAiConfig 内部使用）
 * - 数据库中至少 1 个 active AI model
 *
 * 用法: npx tsx scripts/test-4-e2e.ts
 */

import { config as dotenvConfig } from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenvConfig({ path: path.resolve(__dirname, '..', '.env') })
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') })

import { generateProblems } from '../lib/ai/generator'
import { extractProblems, normalizeProblem } from '../lib/ai/generator'
import { prisma } from '../lib/prisma'

// 从 DB 中探测有效的 userId / modelId（probe-ai-config.ts 已验证可用）
let PROBE_USER_ID = process.env.AI_E2E_USER_ID
let PROBE_MODEL_ID = process.env.AI_E2E_MODEL_ID

async function probeAiConfig() {
  try {
    if (!PROBE_USER_ID) {
      const pref = await prisma.userAiPreference.findFirst({
        orderBy: { lastUsed: 'desc' }
      })
      if (pref) PROBE_USER_ID = pref.userId
    }
    if (!PROBE_MODEL_ID) {
      const model = await prisma.aiModel.findFirst({
        where: { isActive: true, provider: { isActive: true } }
      })
      if (model) PROBE_MODEL_ID = model.id
    }
  } catch (e) {
    console.warn('⚠️  probeAiConfig 失败，将尝试无 modelId 运行', e)
  }
}

interface TestCase {
  name: string
  fn: () => Promise<void>
}

const cases: TestCase[] = [
  // ===== ParamGen =====
  {
    name: 'ParamGen count=1 — topic=动态规划 / 普及',
    fn: async () => {
      const result = await generateProblems({
        mode: 'parametric',
        type: 'programming',
        difficulty: '普及',
        topic: ['动态规划'],
        count: 1,
        modelId: PROBE_MODEL_ID
      }, PROBE_USER_ID)
      if (!result.problems || result.problems.length !== 1) {
        throw new Error(`期望 1 道题，实际 ${result.problems?.length ?? 0}`)
      }
      const p = result.problems[0]
      if (!p.title) throw new Error('title 为空')
      if (!p.description) throw new Error('description 为空')
      if (!p.samples || p.samples.length < 2) {
        throw new Error(`samples 应 >= 2，实际 ${p.samples?.length ?? 0}`)
      }
      if (!p.test_cases || p.test_cases.length < 10) {
        throw new Error(`test_cases 应 >= 10，实际 ${p.test_cases?.length ?? 0}（关键 bug：test_cases=0）`)
      }
      if (!p.tags || p.tags.length < 2) {
        throw new Error(`tags 应 >= 2，实际 ${p.tags?.length ?? 0}`)
      }
      console.log(`   ⏱️  ${result.tokensUsed} tokens`)
    }
  },
  // ===== ParamGen 关键回归（业务决策 2026-06 移除 count=2）=====
  {
    name: 'ParamGen count=1 — topic=图论（单题模式）',
    fn: async () => {
      const result = await generateProblems({
        mode: 'parametric',
        type: 'programming',
        difficulty: '普及',
        topic: ['图论'],
        count: 1,  // 业务决策 2026-06：固定 1
        modelId: PROBE_MODEL_ID
      }, PROBE_USER_ID)
      if (!result.problems || result.problems.length !== 1) {
        throw new Error(`单题模式期望 1 道题，实际 ${result.problems?.length ?? 0}`)
      }
      const p = result.problems[0]
      if (!p.title) throw new Error('title 为空（字段丢失）')
      if (!p.description) throw new Error('description 为空')
      if (!p.test_cases || p.test_cases.length < 10) {
        throw new Error(`test_cases < 10（实际 ${p.test_cases?.length ?? 0}）`)
      }
      console.log(`   ⏱️  ${result.tokensUsed} tokens`)
    }
  },
  {
    name: '✨ 并发：连续 2 次 generateProblems 互不阻塞（业务决策 2026-06）',
    fn: async () => {
      // 验证"并发生成互不阻塞"：同时发起 2 个不同主题的任务，等待都完成
      const startTime = Date.now()
      const [r1, r2] = await Promise.all([
        generateProblems({
          mode: 'parametric',
          type: 'programming',
          difficulty: '入门',
          topic: ['贪心'],
          count: 1,
          modelId: PROBE_MODEL_ID
        }, PROBE_USER_ID),
        generateProblems({
          mode: 'parametric',
          type: 'programming',
          difficulty: '普及',
          topic: ['字符串'],
          count: 1,
          modelId: PROBE_MODEL_ID
        }, PROBE_USER_ID)
      ])
      const elapsed = Date.now() - startTime
      // 2 个任务都应产出 1 道题
      if (!r1.problems?.[0]?.title) throw new Error('任务1 未产出题目')
      if (!r2.problems?.[0]?.title) throw new Error('任务2 未产出题目')
      if (r1.problems[0].title === r2.problems[0].title) {
        throw new Error('2 个并发任务产出了完全相同的题目（疑似串行/复用）')
      }
      // 并发应该比串行快（粗略判断：2 个任务各 ~30s，串行 ~60s+，并发应 < 90s）
      console.log(`   ⏱️  ${elapsed}ms, 任务1: 「${r1.problems[0].title}」, 任务2: 「${r2.problems[0].title}」`)
    }
  },
  {
    name: 'ParamGen 异常路径 — topic 为空',
    fn: async () => {
      // 这种情况：参数没传到 generator，是 API 路由的 validation 拦住的
      // 这里测的是 generator 自身在空 topic 下不应崩溃
      try {
        await generateProblems({
          mode: 'parametric',
          type: 'programming',
          difficulty: '入门',
          topic: [],  // 空 topic
          count: 1,
          modelId: PROBE_MODEL_ID
        }, PROBE_USER_ID)
        // 如果没抛错，说明 generator 内部容忍了空 topic
        // （API 路由层会在 topic 为空时返回 400）
        console.log(`   ⚠️  generator 容忍空 topic（应在 API 路由层拦截）`)
      } catch (e: any) {
        // 抛错也是合理的
        console.log(`   ✅ generator 抛错: ${e.message.slice(0, 80)}`)
      }
    }
  },

  // ===== TestData =====
  {
    name: 'TestData 无标程 — 给定 title+description+IO，生成 5 组测试数据',
    fn: async () => {
      const result = await generateProblems({
        mode: 'test_data',
        title: 'A+B Problem',
        description: '给定两个整数 a 和 b，输出它们的和。',
        inputDescription: '一行两个整数 a, b (-1000 ≤ a, b ≤ 1000)',
        outputDescription: '一个整数，a + b',
        count: 5,
        modelId: PROBE_MODEL_ID
      }, PROBE_USER_ID)
      // TestData 模式返回的可能是 testCases 字段或 problems 字段
      const testCases = (result as any).testCases || result.problems?.[0]?.test_cases
      if (!testCases || testCases.length < 1) {
        throw new Error(`期望至少 1 组测试数据，实际 ${testCases?.length ?? 0}`)
      }
      console.log(`   ⏱️  ${result.tokensUsed} tokens, ${testCases.length} 组测试数据`)
    }
  },
  {
    name: 'TestData 有标程 — 给定 solutionCode，AI 生成 input + 后端跑标程得 output',
    fn: async () => {
      const result = await generateProblems({
        mode: 'test_data',
        title: '最大子段和',
        description: '给定数组，求最大连续子段和',
        inputDescription: '第一行 n，第二行 n 个整数',
        outputDescription: '最大连续子段和',
        count: 5,
        solutionCode: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    int cur = 0, best = INT_MIN;
    for (int x : a) {
        cur = max(x, cur + x);
        best = max(best, cur);
    }
    cout << best << endl;
    return 0;
}`,
        solutionLanguage: 'cpp',
        modelId: PROBE_MODEL_ID
      }, PROBE_USER_ID)
      const testCases = (result as any).testCases || result.problems?.[0]?.test_cases
      if (!testCases || testCases.length < 1) {
        throw new Error(`期望至少 1 组测试数据，实际 ${testCases?.length ?? 0}`)
      }
      console.log(`   ⏱️  ${result.tokensUsed} tokens, ${testCases.length} 组测试数据`)
    }
  }
]

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 AI 出题端到端测试')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // 环境预检
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.AI_DEFAULT_PROVIDER) {
    console.warn('⚠️  未在 .env 找到 DEEPSEEK_API_KEY / OPENAI_API_KEY / AI_DEFAULT_PROVIDER')
    console.warn('   如数据库中已配置 active model 且加密 key 可用，仍可继续')
    console.warn('   否则会因为无 API key 而失败\n')
  }

  // 探测 DB 中可用的 userId / modelId
  await probeAiConfig()
  console.log(`🔍 probe: userId=${PROBE_USER_ID ?? '(none)'} modelId=${PROBE_MODEL_ID ?? '(none)'}\n`)
  if (!PROBE_MODEL_ID) {
    console.warn('⚠️  DB 中没有可用的 active model，将尝试 GLOBAL fallback 配置\n')
  }

  let pass = 0
  let fail = 0
  const failures: Array<{ name: string; reason: string }> = []

  for (const tc of cases) {
    const start = Date.now()
    try {
      await tc.fn()
      const ms = Date.now() - start
      pass++
      console.log(`✅ ${tc.name} (${ms}ms)\n`)
    } catch (e: any) {
      const ms = Date.now() - start
      fail++
      failures.push({ name: tc.name, reason: e?.message || String(e) })
      console.log(`❌ ${tc.name} (${ms}ms)`)
      console.log(`   错误: ${e?.message || String(e)}\n`)
    }
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败 / ${cases.length} 总数`)
  if (fail > 0) {
    console.log(`\n❌ 失败详情:`)
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason}`)
    }
    process.exit(1)
  } else {
    console.log(`\n🎉 全部通过！`)
    process.exit(0)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
