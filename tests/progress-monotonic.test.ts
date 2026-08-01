/**
 * tests/progress-monotonic.test.ts
 * 评测进度单调合并单元测试：
 *  - defaultMergeSubmissionList 对非终态 passedTests/totalTests 只增不减（不回退）
 *  - 终态直接覆盖（不阻塞终态写入）
 */
import { describe, it, expect } from 'vitest'
import { defaultMergeSubmissionList } from '../hooks/useSubmissionResultFlow'
import type { SubmissionListRow } from '../hooks/useSubmissionResultFlow'

function row(partial: Partial<SubmissionListRow>): SubmissionListRow {
  return {
    id: 'sub-1',
    status: 'PENDING',
    submittedAt: new Date().toISOString(),
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: 0,
    ...partial,
  }
}

describe('defaultMergeSubmissionList 进度单调合并', () => {
  it('非终态 JUDGING 推送的 passedTests 只增不减（不回退）', () => {
    const prev = [row({ status: 'JUDGING', passedTests: 5, totalTests: 10 })]
    // 模拟 WS 乱序 / 轮询兜底读到旧 DB 值：迟到的 JUDGING 携带较小 passedTests
    const next = defaultMergeSubmissionList(prev, {
      id: 'sub-1',
      status: 'JUDGING',
      passedTests: 2,
      totalTests: 10,
    })
    expect(next[0].passedTests).toBe(5)
    expect(next[0].totalTests).toBe(10)
  })

  it('非终态推送更大的 passedTests 时正常前进', () => {
    const prev = [row({ status: 'JUDGING', passedTests: 3, totalTests: 10 })]
    const next = defaultMergeSubmissionList(prev, {
      id: 'sub-1',
      status: 'JUDGING',
      passedTests: 7,
      totalTests: 10,
    })
    expect(next[0].passedTests).toBe(7)
  })

  it('非终态 totalTests 只增不减', () => {
    const prev = [row({ status: 'JUDGING', passedTests: 0, totalTests: 10 })]
    // 迟到推送携带更小的 totalTests（不应把 10 回退成 3）
    const next = defaultMergeSubmissionList(prev, {
      id: 'sub-1',
      status: 'JUDGING',
      passedTests: 0,
      totalTests: 3,
    })
    expect(next[0].totalTests).toBe(10)
  })

  it('终态推送直接覆盖（passedTests/totalTests 采用终态值）', () => {
    const prev = [row({ status: 'JUDGING', passedTests: 5, totalTests: 10 })]
    const next = defaultMergeSubmissionList(prev, {
      id: 'sub-1',
      status: 'WA',
      passedTests: 2,
      totalTests: 10,
    })
    expect(next[0].status).toBe('WA')
    expect(next[0].passedTests).toBe(2)
    expect(next[0].totalTests).toBe(10)
  })

  it('passedTests 缺失时保持原值', () => {
    const prev = [row({ status: 'JUDGING', passedTests: 4, totalTests: 10 })]
    const next = defaultMergeSubmissionList(prev, {
      id: 'sub-1',
      status: 'JUDGING',
      totalTests: 10,
    })
    expect(next[0].passedTests).toBe(4)
  })
})
