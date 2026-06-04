/**
 * 字段归一化单元测试
 *
 * 覆盖 5 个场景 + camelCase 归一化 + 兜底字段
 * 测试 extractProblems + normalizeProblem 两个纯函数
 *
 * 用法: npx tsx scripts/test-2-normalize.ts
 */

import { extractProblems, normalizeProblem } from '../lib/ai/generator'

interface TestCase {
  name: string
  fn: () => void
}

const cases: TestCase[] = [
  // 场景 A — 顶层数组
  {
    name: '场景 A — 顶层数组 [{...}, {...}] → 2 道题',
    fn: () => {
      const parsed = [
        { title: '题1', test_cases: [1, 2, 3] },
        { title: '题2', test_cases: [4, 5, 6] }
      ]
      const result = extractProblems(parsed)
      if (result.length !== 2) throw new Error(`期望 2 道题，实际 ${result.length}`)
      if (result[0].title !== '题1') throw new Error(`第 1 道 title 错: ${result[0].title}`)
      if (result[1].title !== '题2') throw new Error(`第 2 道 title 错: ${result[1].title}`)
    }
  },

  // 场景 B — 顶层 { problems: [...] }
  {
    name: '场景 B — 顶层 { problems: [...] } → 2 道题',
    fn: () => {
      const parsed = {
        problems: [
          { title: '题A' },
          { title: '题B' }
        ]
      }
      const result = extractProblems(parsed)
      if (result.length !== 2) throw new Error(`期望 2 道题，实际 ${result.length}`)
      if (result[0].title !== '题A') throw new Error(`第 1 道 title 错`)
    }
  },

  // 场景 C — 关键回归：单对象含 test_cases 数组不能误识别
  {
    name: '场景 C — 单对象含 test_cases 数组 → 包成 [obj]（1 道题，不误识别）',
    fn: () => {
      const parsed = {
        title: '最大矩形',
        description: '求最大矩形面积',
        test_cases: [
          { input: '6\n2 1 5 6 2 3', output: '10' },
          { input: '3\n2 2 2', output: '6' }
        ]
      }
      const result = extractProblems(parsed)
      if (result.length !== 1) {
        throw new Error(`期望 1 道题，实际 ${result.length}（可能是把 test_cases 误识别为 problems）`)
      }
      if (result[0].title !== '最大矩形') {
        throw new Error(`第 1 道 title 错: ${result[0].title}（关键回归 bug）`)
      }
      if (result[0].test_cases.length !== 2) {
        throw new Error(`test_cases 应有 2 个，实际 ${result[0].test_cases.length}`)
      }
    }
  },

  // 场景 D — null / undefined
  {
    name: '场景 D — 顶层 null → 抛错',
    fn: () => {
      try {
        extractProblems(null)
        throw new Error('期望抛错但未抛')
      } catch (e: any) {
        if (!e.message.includes('Invalid JSON structure')) {
          throw new Error(`错误信息不符: ${e.message}`)
        }
      }
    }
  },
  {
    name: '场景 D2 — 顶层 undefined → 抛错',
    fn: () => {
      try {
        extractProblems(undefined)
        throw new Error('期望抛错但未抛')
      } catch (e: any) {
        if (!e.message.includes('Invalid JSON structure')) {
          throw new Error(`错误信息不符: ${e.message}`)
        }
      }
    }
  },
  {
    name: '场景 D3 — 顶层是字符串（标量）→ 抛错',
    fn: () => {
      try {
        extractProblems('hello')
        throw new Error('期望抛错但未抛')
      } catch (e: any) {
        if (!e.message.includes('Invalid JSON structure')) {
          throw new Error(`错误信息不符: ${e.message}`)
        }
      }
    }
  },

  // camelCase → snake_case 归一化
  {
    name: 'camelCase → snake_case — testCases / timeLimit / solutionCpp 等',
    fn: () => {
      const p = {
        title: 'x',
        testCases: [{ input: '1', output: '2' }],
        timeLimit: 1500,
        memoryLimit: 256,
        solutionCpp: '#include <bits/stdc++.h>\nint main() { return 0; }',
        solutionPython: 'print(0)'
      }
      const n = normalizeProblem(p)
      if (!n.test_cases) throw new Error('test_cases 未归一化')
      if (n.test_cases.length !== 1) throw new Error('test_cases 长度错')
      if (n.time_limit !== 1500) throw new Error(`time_limit 期望 1500，实际 ${n.time_limit}`)
      if (n.memory_limit !== 256) throw new Error(`memory_limit 期望 256，实际 ${n.memory_limit}`)
      if (!n.solution_cpp) throw new Error('solution_cpp 未归一化')
      if (!n.solution_python) throw new Error('solution_python 未归一化')
    }
  },
  {
    name: 'snake_case 优先 — 同时存在时不覆盖',
    fn: () => {
      const p = {
        title: 'x',
        testCases: [{ input: '1', output: '2' }],  // camelCase
        test_cases: [{ input: 'a', output: 'b' }]  // snake_case 优先
      }
      const n = normalizeProblem(p)
      if (n.test_cases[0].input !== 'a') {
        throw new Error('snake_case 应优先于 camelCase，但被覆盖了')
      }
    }
  },

  // 兜底字段
  {
    name: '兜底字段 — 缺 time_limit → 1000',
    fn: () => {
      const p = { title: 'x' }
      const n = normalizeProblem(p)
      if (n.time_limit !== 1000) throw new Error(`time_limit 期望 1000，实际 ${n.time_limit}`)
    }
  },
  {
    name: '兜底字段 — 缺 memory_limit → 128',
    fn: () => {
      const p = { title: 'x' }
      const n = normalizeProblem(p)
      if (n.memory_limit !== 128) throw new Error(`memory_limit 期望 128，实际 ${n.memory_limit}`)
    }
  },
  {
    name: '兜底字段 — input / output 兜底 input_description / output_description',
    fn: () => {
      const p = {
        title: 'x',
        input_description: '第一行 n',
        output_description: '最大子段和'
      }
      const n = normalizeProblem(p)
      if (n.input !== '第一行 n') throw new Error(`input 兜底失败: ${n.input}`)
      if (n.output !== '最大子段和') throw new Error(`output 兜底失败: ${n.output}`)
    }
  },
  {
    name: '兜底字段 — 缺 input / output → 空字符串',
    fn: () => {
      const p = { title: 'x' }
      const n = normalizeProblem(p)
      if (n.input !== '') throw new Error(`input 应为空，实际 ${JSON.stringify(n.input)}`)
      if (n.output !== '') throw new Error(`output 应为空，实际 ${JSON.stringify(n.output)}`)
    }
  },

  // 集成场景
  {
    name: '集成 — count=2 但 AI 仍输出单对象（边界情况）',
    fn: () => {
      // 模拟 AI 把 2 道题塞进同一对象（重复 key）的场景
      // 实际 JSON.parse 已合并重复 key，结果是单个对象
      const parsed = {
        title: '题1的标题',  // 只剩最后一个
        description: '题1的描述'
      }
      const result = extractProblems(parsed)
      const normalized = result.map(normalizeProblem)
      if (normalized.length !== 1) throw new Error('单对象应被包成 1 道题')
      if (normalized[0].title !== '题1的标题') throw new Error('title 错')
    }
  },

  // 关键回归：AI 把单道题塞进 { problems: { ... } } 单对象
  {
    name: '✨ 关键回归 — 顶层 { problems: { ... } } 单对象 → 包成 1 道题',
    fn: () => {
      const parsed = {
        problems: {
          title: '套娃题',
          test_cases: [{ input: '1', output: '2' }]
        }
      }
      const result = extractProblems(parsed)
      if (result.length !== 1) {
        throw new Error(`期望 1 道题，实际 ${result.length}（AI 误用单对象而非数组）`)
      }
      if (result[0].title !== '套娃题') {
        throw new Error(`title 错: ${result[0].title}`)
      }
      if (!result[0].test_cases || result[0].test_cases.length !== 1) {
        throw new Error('test_cases 字段丢失')
      }
    }
  },

  // 关键回归：AI 把 testCases (camelCase) 字段塞进 test_data 响应
  {
    name: '✨ TestDataGen — { testCases: [...] } 兜底为 test_cases',
    fn: () => {
      // 模拟 AI 偶尔把 testCases 写成 camelCase 的场景
      const parsed = {
        testCases: [
          { input: '5\n1 2 3 4 5', output: '15' },
          { input: '3\n10 20 30', output: '60' }
        ]
      }
      // TestData 提取逻辑（复刻 generator.ts 中的 fallback 链）
      const tcs = (parsed as any).test_cases ?? (parsed as any).testCases
      if (!Array.isArray(tcs)) throw new Error('testCases 兜底失败')
      if (tcs.length !== 2) throw new Error(`期望 2 组，实际 ${tcs.length}`)
    }
  }
]

let pass = 0
let fail = 0
const failures: Array<{ name: string; reason: string }> = []

for (const tc of cases) {
  try {
    tc.fn()
    pass++
    console.log(`✅ ${tc.name}`)
  } catch (e: any) {
    fail++
    failures.push({ name: tc.name, reason: e?.message || String(e) })
    console.log(`❌ ${tc.name} — ${e?.message || String(e)}`)
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
