/**
 * AI 响应解析器单元测试 — 极简版
 *
 * 核心原则：DeepSeek response_format: { type: 'json_object' } 应当返回严格合法 JSON，
 * 解析器只做两件事：剥 <think> 块 → JSON.parse。
 *
 * 用法: npx tsx scripts/test-response-parser.ts
 */

import { safeJsonParse, stripThinkBlocks } from '../lib/ai/response-parser'

interface TestCase {
  name: string
  input: string
  expectThrow?: boolean
  expectEqual?: any
}

const cases: TestCase[] = [
  {
    name: '1. 纯合法 JSON — 直接解析',
    input: '{"a": 1, "b": [1, 2, 3]}',
    expectEqual: { a: 1, b: [1, 2, 3] }
  },
  {
    name: '2. 完整题目的 JSON',
    input: '{"problems": [{"title": "台阶问题", "difficulty": "普及", "tags": ["DP"]}]}',
    expectEqual: { problems: [{ title: '台阶问题', difficulty: '普及', tags: ['DP'] }] }
  },
  {
    name: '3. <think> 块泄漏（DeepSeek v4 thinking 模式）',
    input: '<think>\n用户想要一道动态规划的题目，普及难度，需要 5 组测试数据。\n</think>\n{"problems": [{"title": "台阶问题", "difficulty": "普及"}]}',
    expectEqual: { problems: [{ title: '台阶问题', difficulty: '普及' }] }
  },
  {
    name: '3b. 多行 think 块 + JSON',
    input: '<think>\n让我思考一下... \n关键点：动态规划、状态转移方程\n</think>\n{"result": "ok"}',
    expectEqual: { result: 'ok' }
  },
  {
    name: '3c. think 块内含 JSON 示例',
    input: '<think>这里我先想想：{"foo": 1} 这个结构合适吗？</think>{"answer": 42}',
    expectEqual: { answer: 42 }
  },
  {
    name: '4. 非法 JSON（缺逗号）— 应抛错，让模型自己改 prompt',
    input: '[{"a": 1}{"b": 2}]',
    expectThrow: true
  },
  {
    name: '5. 非法 JSON（尾随逗号）— 应抛错',
    input: '{"a": 1, "b": 2,}',
    expectThrow: true
  },
  {
    name: '6. 完全非法文本 — 应抛错',
    input: '你好，我是一个 AI 助手。',
    expectThrow: true
  },
  {
    name: '7. 空字符串 — 应抛错',
    input: '',
    expectThrow: true
  },
  {
    name: '8. 非字符串输入 — 应抛错',
    input: null as any,
    expectThrow: true
  }
]

let passed = 0
let failed = 0
const failures: Array<{ name: string; error: string }> = []

for (const tc of cases) {
  try {
    if (tc.expectThrow) {
      try {
        const result = safeJsonParse(tc.input)
        failed++
        failures.push({ name: tc.name, error: `Expected throw, got: ${JSON.stringify(result).substring(0, 100)}` })
        console.log(`  ❌ ${tc.name} — 期望抛错但成功解析为 ${JSON.stringify(result).substring(0, 50)}`)
      } catch (e: any) {
        if (e.code !== 'AI_PARSE_FAILED') {
          failed++
          failures.push({ name: tc.name, error: `Wrong error code: ${e.code}` })
          console.log(`  ❌ ${tc.name} — 抛错但 code 非 AI_PARSE_FAILED: ${e.code}`)
        } else {
          passed++
          console.log(`  ✅ ${tc.name} — 正确抛 AI_PARSE_FAILED`)
        }
      }
    } else {
      const result = safeJsonParse(tc.input)
      const actual = JSON.stringify(result)
      const expected = JSON.stringify(tc.expectEqual)
      if (actual === expected) {
        passed++
        console.log(`  ✅ ${tc.name}`)
      } else {
        failed++
        failures.push({ name: tc.name, error: `Expected ${expected}, got ${actual}` })
        console.log(`  ❌ ${tc.name}`)
        console.log(`     Expected: ${expected}`)
        console.log(`     Got:      ${actual}`)
      }
    }
  } catch (e: any) {
    if (!tc.expectThrow) {
      failed++
      failures.push({ name: tc.name, error: e.message })
      console.log(`  ❌ ${tc.name} — 抛错: ${e.message}`)
    } else {
      passed++
    }
  }
}

// 单独测试 stripThinkBlocks
console.log('\n--- stripThinkBlocks 独立测试 ---')
const thinkTests = [
  { input: '<think>foo</think>bar', expected: 'bar' },
  { input: '<THINK>foo</THINK>bar', expected: 'bar' },
  { input: '<think>multi\nline\ncontent</think>rest', expected: 'rest' },
  { input: 'no think blocks here', expected: 'no think blocks here' },
  { input: '<think>a</think><think>b</think>end', expected: 'end' },
  { input: '<think>one</think>{"json":1}', expected: '{"json":1}' }
]
for (const tt of thinkTests) {
  const got = stripThinkBlocks(tt.input)
  if (got === tt.expected) {
    passed++
    console.log(`  ✅ "${tt.input}" → "${got}"`)
  } else {
    failed++
    failures.push({ name: `stripThinkBlocks: ${tt.input}`, error: `Expected "${tt.expected}", got "${got}"` })
    console.log(`  ❌ "${tt.input}" → "${got}" (expected "${tt.expected}")`)
  }
}

console.log(`\n========================================`)
console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`)
console.log(`========================================`)

if (failures.length > 0) {
  console.log('\n失败详情:')
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`)
  }
  process.exit(1)
} else {
  console.log('\n🎉 全部测试通过！')
  process.exit(0)
}
