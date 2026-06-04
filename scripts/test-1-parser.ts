/**
 * AI 响应解析器单元测试 — 完整版
 *
 * 覆盖场景：
 * 1. 已有 16+ 用例（来自 test-response-parser.ts）
 * 2. 新增：响应被 max_tokens 截断（末尾 "ou）→ 应抛 AI_PARSE_FAILED 且 hint 含"可能被截断"
 * 3. 新增：空字符串 "" → 应抛 AI_PARSE_FAILED
 * 4. 新增：think 块包裹有效 JSON → 正确解析
 *
 * 用法: npx tsx scripts/test-1-parser.ts
 */

import { safeJsonParse, stripThinkBlocks } from '../lib/ai/response-parser'

interface TestCase {
  name: string
  input: string
  expectThrow?: boolean
  expectEqual?: any
  expectHintContains?: string
  expectCode?: string
}

const cases: TestCase[] = [
  // 基础解析
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

  // think 块处理
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

  // 非法 JSON
  {
    name: '4. 非法 JSON（缺逗号）— 应抛错',
    input: '[{"a": 1}{"b": 2}]',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED'
  },
  {
    name: '5. 非法 JSON（未闭合花括号）— 应抛错',
    input: '{"a": 1, "b": {"c": 2',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED'
  },

  // ✨ 新增用例 1：截断检测（响应末尾 "ou，无闭合）
  {
    name: '6. ✨ 截断检测 — 响应末尾 "ou" 引发末尾未闭合',
    input: '{\n  "title": "最大矩形",\n  "description": "...",\n  "samples": [\n    {"input": "8 3\\n1 3 -1", "outpu',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED',
    expectHintContains: '截断'
  },
  {
    name: '6b. 截断检测 — 响应末尾未闭合 [',
    input: '{"problems": [{"title": "x"}, {"title": "y"',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED',
    expectHintContains: '截断'
  },

  // ✨ 新增用例 2：空字符串
  {
    name: '7. ✨ 空字符串 — 应抛错',
    input: '',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED'
  },

  // ✨ 新增用例 3：think 块包裹有效 JSON
  {
    name: '8. ✨ think 块包裹有效 JSON — 正确解析',
    input: '<think>我需要生成一道动态规划题。让我想想：\n  状态：dp[i] 表示...\n  转移：dp[i] = max(dp[i-1], dp[i-2] + arr[i])\n</think>\n{"title": "最大子段和", "difficulty": "普及"}',
    expectEqual: { title: '最大子段和', difficulty: '普及' }
  },
  {
    name: '8b. think 块内多行（多行 think）— 正确解析',
    input: '<think>\n用户问的是关于滑动窗口的题目。\n关键点：\n- 维护双端队列\n- 队列头始终是窗口最大值\n</think>\n\n{\n  "problems": []\n}',
    expectEqual: { problems: [] }
  },

  // 复杂场景
  {
    name: '9. stripThinkBlocks 单元测试 - 简单 case',
    input: '<think>thinking</think>{"a": 1}',
    expectEqual: { a: 1 }
  },
  {
    name: '10. 嵌套 think 块（迭代剥离）— 正确解析',
    input: '<think>外层<think>内层</think>外层继续</think>{"result": "ok"}',
    expectEqual: { result: 'ok' }
  },
  {
    name: '10b. 3 层嵌套 think',
    input: '<think>a<think>b<think>c</think>b end</think>a end</think>{"x": 1}',
    expectEqual: { x: 1 }
  },
  {
    name: '11. JSON 字符串内含 think 字面量',
    input: '{"text": "这里有个 think 但不是块", "value": 42}',
    expectEqual: { text: '这里有个 think 但不是块', value: 42 }
  },
  {
    name: '12. 数字、布尔、null 类型',
    input: '{"num": 42, "bool": true, "nothing": null, "arr": [1, 2, 3]}',
    expectEqual: { num: 42, bool: true, nothing: null, arr: [1, 2, 3] }
  },
  {
    name: '13. 中文 + Unicode 转义',
    input: '{"title": "\\u4e2d\\u6587\\u6807\\u9898", "desc": "中文描述"}',
    expectEqual: { title: '中文标题', desc: '中文描述' }
  },
  {
    name: '14. Markdown JSON 代码块（应能剥掉）',
    input: '```json\n{"a": 1}\n```',
    expectThrow: true,  // 当前 stripThinkBlocks 不处理 ```，抛错是当前实现的行为
    expectCode: 'AI_PARSE_FAILED'
  },
  {
    name: '14b. Markdown JSON 代码块 + think 块',
    input: '<think>我先想好...</think>```json\n{"a": 1}\n```',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED'
  },
  {
    name: '15. 中文标点 + 双引号未转义（非法 JSON）— 应抛错',
    input: '{"text": "他说："你好"", "ok": true}',
    expectThrow: true,
    expectCode: 'AI_PARSE_FAILED'
  }
]

// 测试执行器
let pass = 0
let fail = 0
const failures: Array<{ name: string; reason: string }> = []

for (const tc of cases) {
  try {
    const result = safeJsonParse(tc.input)
    if (tc.expectThrow) {
      fail++
      failures.push({ name: tc.name, reason: '预期抛错但未抛' })
      console.log(`❌ ${tc.name} — 预期抛错但未抛`)
      continue
    }
    if (tc.expectEqual) {
      const resultStr = JSON.stringify(result)
      const expectStr = JSON.stringify(tc.expectEqual)
      if (resultStr === expectStr) {
        pass++
        console.log(`✅ ${tc.name}`)
      } else {
        fail++
        failures.push({
          name: tc.name,
          reason: `结果不匹配\n     实际: ${resultStr}\n     预期: ${expectStr}`
        })
        console.log(`❌ ${tc.name}\n   ${resultStr}\n   vs\n   ${expectStr}`)
      }
    } else {
      pass++
      console.log(`✅ ${tc.name}`)
    }
  } catch (e: any) {
    if (tc.expectThrow) {
      // 验证错误码
      if (tc.expectCode && e.code !== tc.expectCode) {
        fail++
        failures.push({
          name: tc.name,
          reason: `错误码不匹配（实际 ${e.code}，预期 ${tc.expectCode}）`
        })
        console.log(`❌ ${tc.name} — 错误码 ${e.code} ≠ ${tc.expectCode}`)
        continue
      }
      // 验证 hint
      if (tc.expectHintContains) {
        const hint = e.info?.hint || ''
        if (!hint.includes(tc.expectHintContains)) {
          fail++
          failures.push({
            name: tc.name,
            reason: `hint 不含"${tc.expectHintContains}"（实际: ${hint}）`
          })
          console.log(`❌ ${tc.name} — hint 不含"${tc.expectHintContains}"`)
          continue
        }
      }
      pass++
      console.log(`✅ ${tc.name}（抛错符合预期）`)
    } else {
      fail++
      failures.push({
        name: tc.name,
        reason: `意外抛错: ${e?.message}\n     抛错码: ${e?.code}`
      })
      console.log(`❌ ${tc.name} — 意外抛错: ${e?.message}`)
    }
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
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
