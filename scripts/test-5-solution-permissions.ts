/**
 * 题解查看权限控制 — 单元测试
 *
 * 不依赖真实数据库：mock 掉 prisma.submission.findFirst，让 getUserBestScore
 * 返回我们预设的分数。
 *
 * 覆盖 5 种 reason：
 *   - ADMIN
 *   - TEACHER
 *   - ENOUGH_SCORE
 *   - ASSIGNMENT_CONTEXT
 *   - NO_SUBMISSION（顺便覆盖 LOW_SCORE 的纯函数分支）
 *
 * 用法: npx tsx scripts/test-5-solution-permissions.ts
 */

import { prisma } from '../lib/prisma'
import {
  canViewSolutions,
  getUserBestScore,
  decideSolutionView,
  REQUIRED_SOLUTION_SCORE
} from '../lib/solution/permissions'

// ──────────────────────────────────────────────────────────────────────────
// 1) 准备 prisma mock：替换 submission.findFirst
// ──────────────────────────────────────────────────────────────────────────

let mockBestScore: number | null = null
let findFirstCallCount = 0

const originalFindFirst = prisma.submission.findFirst.bind(prisma.submission)

// 用一个稳定的可恢复 mock，保证不污染其它测试
;(prisma.submission as any).findFirst = async (args: any) => {
  findFirstCallCount++
  if (mockBestScore === null) {
    return null
  }
  return { score: mockBestScore }
}

function restorePrisma() {
  ;(prisma.submission as any).findFirst = originalFindFirst
}

// ──────────────────────────────────────────────────────────────────────────
// 2) 测试用例
// ──────────────────────────────────────────────────────────────────────────

interface TestCase {
  name: string
  expected: {
    allowed: boolean
    reason: string
    bestScore?: number
  }
  run: () => Promise<void>
}

const cases: TestCase[] = [
  // 用例 1：管理员（role=ADMIN）→ ADMIN
  {
    name: '1. 管理员 role=ADMIN → 允许 / ADMIN',
    expected: { allowed: true, reason: 'ADMIN' },
    run: async () => {
      const result = await canViewSolutions(
        { id: 'u-admin-1', role: 'ADMIN', isAdmin: true },
        'p-1'
      )
      assertResult(result, { allowed: true, reason: 'ADMIN' })
      if (findFirstCallCount !== 0) {
        throw new Error('管理员应短路，不应查 DB')
      }
    }
  },

  // 用例 2：教师（role=TEACHER）→ TEACHER
  {
    name: '2. 教师 role=TEACHER → 允许 / TEACHER',
    expected: { allowed: true, reason: 'TEACHER' },
    run: async () => {
      findFirstCallCount = 0
      const result = await canViewSolutions(
        { id: 'u-teacher-1', role: 'TEACHER' },
        'p-2'
      )
      assertResult(result, { allowed: true, reason: 'TEACHER' })
      if (findFirstCallCount !== 0) {
        throw new Error('教师应短路，不应查 DB')
      }
    }
  },

  // 用例 3：普通用户分数 >= 60 → ENOUGH_SCORE
  {
    name: '3. 普通用户最高分=85 → 允许 / ENOUGH_SCORE',
    expected: { allowed: true, reason: 'ENOUGH_SCORE', bestScore: 85 },
    run: async () => {
      findFirstCallCount = 0
      mockBestScore = 85
      const result = await canViewSolutions(
        { id: 'u-user-1', role: 'USER' },
        'p-3'
      )
      assertResult(result, { allowed: true, reason: 'ENOUGH_SCORE', bestScore: 85 })
      if (findFirstCallCount === 0) {
        throw new Error('普通用户应查询 DB')
      }
    }
  },

  // 用例 4：作业场景下隐藏 → ASSIGNMENT_CONTEXT
  {
    name: '4. 普通用户在作业场景下 → 隐藏 / ASSIGNMENT_CONTEXT',
    expected: { allowed: false, reason: 'ASSIGNMENT_CONTEXT' },
    run: async () => {
      findFirstCallCount = 0
      mockBestScore = 100 // 即便分数够也隐藏
      const result = await canViewSolutions(
        { id: 'u-user-2', role: 'USER' },
        'p-4',
        { isAssignmentContext: true }
      )
      assertResult(result, { allowed: false, reason: 'ASSIGNMENT_CONTEXT' })
      if (findFirstCallCount !== 0) {
        throw new Error('作业场景下不应查 DB')
      }
    }
  },

  // 用例 5：普通用户无提交 → NO_SUBMISSION
  {
    name: '5. 普通用户无提交记录 → 拒绝 / NO_SUBMISSION',
    expected: { allowed: false, reason: 'NO_SUBMISSION', bestScore: 0 },
    run: async () => {
      findFirstCallCount = 0
      mockBestScore = null // 模拟无提交
      const result = await canViewSolutions(
        { id: 'u-user-3', role: 'USER' },
        'p-5'
      )
      assertResult(result, { allowed: false, reason: 'NO_SUBMISSION', bestScore: 0 })
    }
  }
]

// ──────────────────────────────────────────────────────────────────────────
// 3) 辅助函数 & 纯函数分支测试
// ──────────────────────────────────────────────────────────────────────────

function assertResult(
  actual: { allowed: boolean; reason: string; bestScore?: number; requiredScore: number },
  expected: { allowed: boolean; reason: string; bestScore?: number }
) {
  if (actual.allowed !== expected.allowed) {
    throw new Error(
      `allowed 不匹配: 实际=${actual.allowed} 预期=${expected.allowed}`
    )
  }
  if (actual.reason !== expected.reason) {
    throw new Error(
      `reason 不匹配: 实际=${actual.reason} 预期=${expected.reason}`
    )
  }
  if (expected.bestScore !== undefined && actual.bestScore !== expected.bestScore) {
    throw new Error(
      `bestScore 不匹配: 实际=${actual.bestScore} 预期=${expected.bestScore}`
    )
  }
  if (actual.requiredScore !== REQUIRED_SOLUTION_SCORE) {
    throw new Error(
      `requiredScore 应为 ${REQUIRED_SOLUTION_SCORE}，实际=${actual.requiredScore}`
    )
  }
}

// 额外的纯函数分支覆盖（保证 LOW_SCORE 也能跑通）
function runPureFunctionExtraCases() {
  // 6) 普通用户分数 < 60 → LOW_SCORE
  {
    const result = decideSolutionView(
      { id: 'u-low', role: 'USER' },
      30,
      {}
    )
    assertResult(result, { allowed: false, reason: 'LOW_SCORE', bestScore: 30 })
    console.log(`✅ 6. (纯函数) 普通用户最高分=30 → 拒绝 / LOW_SCORE`)
  }

  // 7) isAdmin=true 但无 role → ADMIN
  {
    const result = decideSolutionView(
      { id: 'u-flag', isAdmin: true },
      0,
      {}
    )
    assertResult(result, { allowed: true, reason: 'ADMIN' })
    console.log(`✅ 7. (纯函数) isAdmin=true → 允许 / ADMIN`)
  }

  // 8) 边界：bestScore=60 → ENOUGH_SCORE
  {
    const result = decideSolutionView(
      { id: 'u-edge', role: 'USER' },
      60,
      {}
    )
    assertResult(result, { allowed: true, reason: 'ENOUGH_SCORE', bestScore: 60 })
    console.log(`✅ 8. (纯函数) 边界值 bestScore=60 → 允许 / ENOUGH_SCORE`)
  }

  // 9) 边界：bestScore=59 → LOW_SCORE
  {
    const result = decideSolutionView(
      { id: 'u-edge2', role: 'USER' },
      59,
      {}
    )
    assertResult(result, { allowed: false, reason: 'LOW_SCORE', bestScore: 59 })
    console.log(`✅ 9. (纯函数) 边界值 bestScore=59 → 拒绝 / LOW_SCORE`)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4) 额外：getUserBestScore 包装
// ──────────────────────────────────────────────────────────────────────────

async function runGetUserBestScoreCases() {
  // a) mock 返回 null → 0
  mockBestScore = null
  const s1 = await getUserBestScore('u-x', 'p-x')
  if (s1 !== 0) throw new Error(`getUserBestScore(null) 应为 0，实际 ${s1}`)
  console.log(`✅ a. getUserBestScore — 无提交 → 0`)

  // b) mock 返回 { score: 75 } → 75
  mockBestScore = 75
  const s2 = await getUserBestScore('u-y', 'p-y')
  if (s2 !== 75) throw new Error(`getUserBestScore 应为 75，实际 ${s2}`)
  console.log(`✅ b. getUserBestScore — 有提交 → 75`)

  // c) 空 userId → 0
  const s3 = await getUserBestScore('', 'p-z')
  if (s3 !== 0) throw new Error(`getUserBestScore('') 应为 0，实际 ${s3}`)
  console.log(`✅ c. getUserBestScore — 空参数 → 0`)
}

// ──────────────────────────────────────────────────────────────────────────
// 5) 主流程
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  let pass = 0
  let fail = 0
  const failures: Array<{ name: string; reason: string }> = []

  console.log('━'.repeat(60))
  console.log('🧪 题解查看权限控制 — 单元测试')
  console.log('━'.repeat(60))

  for (const tc of cases) {
    try {
      await tc.run()
      pass++
      console.log(`✅ ${tc.name}`)
    } catch (e: any) {
      fail++
      failures.push({ name: tc.name, reason: e?.message || String(e) })
      console.log(`❌ ${tc.name} — ${e?.message || String(e)}`)
    }
  }

  console.log('\n— 纯函数分支补充 —')
  try {
    runPureFunctionExtraCases()
    pass += 4
  } catch (e: any) {
    fail += 4
    failures.push({ name: '纯函数分支', reason: e?.message || String(e) })
    console.log(`❌ 纯函数分支 — ${e?.message || String(e)}`)
  }

  console.log('\n— getUserBestScore 包装补充 —')
  try {
    await runGetUserBestScoreCases()
    pass += 3
  } catch (e: any) {
    fail += 3
    failures.push({ name: 'getUserBestScore', reason: e?.message || String(e) })
    console.log(`❌ getUserBestScore — ${e?.message || String(e)}`)
  }

  // 收尾：恢复 prisma（防止影响其它脚本）
  restorePrisma()

  console.log('\n' + '━'.repeat(60))
  console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败`)
  if (fail > 0) {
    console.log('\n❌ 失败详情:')
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason}`)
    }
    process.exit(1)
  } else {
    console.log('\n🎉 全部通过！')
    process.exit(0)
  }
}

main().catch((e) => {
  restorePrisma()
  console.error('未捕获异常:', e)
  process.exit(1)
})
