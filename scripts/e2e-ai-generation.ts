/**
 * AI 出题端到端测试
 *
 * 依次触发 2 种生成模式（ParamGen / TestData），
 * 断言返回结构 + 必填字段。
 *
 * 用法:
 *   1. 在 .env 配 DEEPSEEK_API_KEY 或确保 admin 已有 DeepSeek 服务商配置
 *   2. npx tsx scripts/e2e-ai-generation.ts
 *
 * 注意：本脚本会消耗 API 配额，建议先用 mock 数据跑解析器单元测试
 *     (npx tsx scripts/test-response-parser.ts)
 */

import { logger } from '../lib/logger'
import { generateProblems, GenerationParams } from '../lib/ai/generator'

// 通过 .env 或环境变量直接读取 DEEPSEEK_API_KEY；缺则退出
import 'dotenv/config'

const HAS_API_KEY = !!process.env.DEEPSEEK_API_KEY

interface TestCase {
  name: string
  params: GenerationParams
  validate: (result: any) => string | null  // 返回 null 表示通过，返回字符串表示错误
}

const testCases: TestCase[] = [
  {
    name: 'ParamGen 模式 — 普及难度 + 动态规划',
    params: {
      mode: 'parametric',
      type: 'programming',
      difficulty: '普及',
      topic: ['动态规划'],
      count: 1,
      additionalInfo: '数据范围 n ≤ 1000'
    },
    validate: (r) => {
      if (!Array.isArray(r.problems) || r.problems.length === 0) {
        return 'problems 数组为空'
      }
      const p = r.problems[0]
      const missing: string[] = []
      if (!p.title) missing.push('title')
      if (!p.description) missing.push('description')
      if (!p.samples || p.samples.length === 0) missing.push('samples')
      if (!p.test_cases || p.test_cases.length < 3) missing.push('test_cases (需要 >= 3)')
      if (!p.solution_cpp && !p.solution_python) missing.push('solution_cpp / solution_python')
      if (missing.length > 0) return `必填字段缺失: ${missing.join(', ')}`
      return null
    }
  },
  {
    name: 'TestData 模式 — 自动生成测试数据',
    params: {
      mode: 'test_data',
      title: '最大连续子段和',
      description: '给定一个长度为 n 的整数数组，求最大连续子段和。',
      inputDescription: '第一行 n，第二行 n 个整数',
      outputDescription: '最大连续子段和',
      count: 5,
      solutionCode: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    scanf("%d", &n);
    long long cur = 0, best = LLONG_MIN;
    for (int i = 0; i < n; i++) {
        long long x;
        scanf("%lld", &x);
        cur = max(cur + x, x);
        best = max(best, cur);
    }
    printf("%lld", best);
    return 0;
}`,
      solutionLanguage: 'cpp'
    },
    validate: (r) => {
      if (!Array.isArray(r.testCases) || r.testCases.length < 5) {
        return `testCases 不足 5 组（实际 ${r.testCases?.length || 0}）`
      }
      const invalid = r.testCases.find((tc: any) => !tc.input || !tc.output)
      if (invalid) return '有 testCase 缺 input 或 output'
      return null
    }
  }
]

async function runTest(tc: TestCase): Promise<{ pass: boolean; error?: string; result?: any }> {
  console.log(`\n━━ ${tc.name} ━━`)
  try {
    const result = await generateProblems(tc.params)
    const errMsg = tc.validate(result)
    if (errMsg) {
      console.log(`  ❌ 失败: ${errMsg}`)
      return { pass: false, error: errMsg, result }
    }
    console.log(`  ✅ 通过`)
    if (result.problems) {
      console.log(`     生成题目数: ${result.problems.length}`)
      if (result.problems[0]?.title) {
        console.log(`     标题: ${result.problems[0].title}`)
      }
    }
    if (result.testCases) {
      console.log(`     测试数据: ${result.testCases.length} 组`)
    }
    if (result.qualityIssues && result.qualityIssues.length > 0) {
      console.log(`     ⚠️  质量问题: ${result.qualityIssues.length} 条`)
    }
    console.log(`     tokens: ${result.tokensUsed}`)
    return { pass: true, result }
  } catch (e: any) {
    const errorInfo = {
      message: e?.message,
      code: e?.code,
      info: e?.info
    }
    console.log(`  ❌ 异常: ${e?.message || String(e)}`)
    if (e?.code === 'AI_PARSE_FAILED') {
      console.log(`     解析失败信息:`)
      console.log(`       - 尝试的策略: ${e?.info?.strategiesTried?.join(', ')}`)
      console.log(`       - 剥离了 think 块: ${e?.info?.strippedThinkBlock}`)
      console.log(`       - 原始内容预览: ${e?.info?.originalContent?.substring(0, 200)}`)
    } else {
      console.log(`     堆栈: ${e?.stack?.split('\n').slice(0, 3).join('\n')}`)
    }
    return { pass: false, error: JSON.stringify(errorInfo, null, 2) }
  }
}

async function main() {
  if (!HAS_API_KEY) {
    console.log('⚠️  未配置 DEEPSEEK_API_KEY 环境变量')
    console.log('   本脚本会调用真实 DeepSeek API，需要：')
    console.log('   1. .env 配 DEEPSEEK_API_KEY=sk-...')
    console.log('   2. 或通过 admin → AI 模型管理 配好 DeepSeek 服务商')
    console.log('   3. 重启 dev server 后再跑此脚本')
    console.log('')
    console.log('若只想验证解析器，跑这个：')
    console.log('   npx tsx scripts/test-response-parser.ts')
    process.exit(0)
  }

  console.log('🚀 开始端到端测试...')
  console.log(`   API Key: ${process.env.DEEPSEEK_API_KEY?.slice(0, 8)}...`)
  console.log(`   Base URL: ${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'}`)
  console.log('')

  const results: Array<{ name: string; pass: boolean; error?: string }> = []
  for (const tc of testCases) {
    const r = await runTest(tc)
    results.push({ name: tc.name, pass: r.pass, error: r.error })
    // 每个测试间休息 2 秒，避免触发限流
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log('\n\n━━ 总结 ━━')
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`)
  }
  console.log(`\n  通过: ${passed} / ${results.length}  失败: ${failed}`)

  if (failed > 0) {
    process.exit(1)
  }
  process.exit(0)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
