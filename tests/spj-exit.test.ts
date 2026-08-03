/**
 * Special Judge 退出码解析单测（不依赖 g++ / Linux 沙箱）
 */
import { describe, it, expect } from 'vitest'
import { parseSpjExit } from '@/lib/judge/spj'

describe('SPJ exit code mapping (Testlib)', () => {
  it('maps 0 to AC', () => {
    const r = parseSpjExit(0, '', 'ok', 10)
    expect(r.status).toBe('AC')
    expect(r.score).toBe(10)
  })

  it('maps 1 to WA', () => {
    const r = parseSpjExit(1, '', 'wrong answer', 10)
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })

  it('maps 7 quitp(0.5) to PC with half score', () => {
    const r = parseSpjExit(7, '', '0.5 Partially Correct', 10)
    expect(r.status).toBe('PC')
    expect(r.score).toBe(5)
  })

  it('maps 7 quitp(1.0) to AC', () => {
    const r = parseSpjExit(7, '', '1.0', 10)
    expect(r.status).toBe('AC')
    expect(r.score).toBe(10)
  })

  it('maps 3 _fail to SE', () => {
    const r = parseSpjExit(3, '', 'FAIL checker bug', 10)
    expect(r.status).toBe('SE')
  })

  // B-P1-1：墙钟超时（runner/dsoj-watch 退出码 152，或 Node timeout 兜底归一为 152）
  // 必须判 SE，而不是被误判成 WA（退出码 1）
  it('maps timeout (152, SIGXCPU) to SE, not WA', () => {
    const r = parseSpjExit(152, '', '', 10)
    expect(r.status).toBe('SE')
    expect(r.score).toBe(0)
    expect(r.message).toContain('超时')
  })

  it('maps 137 (SIGKILL, 墙钟强杀/内存超限) to SE', () => {
    const r = parseSpjExit(137, '', '', 10)
    expect(r.status).toBe('SE')
    expect(r.score).toBe(0)
  })

  it('keeps exit 1 as WA (超时归一不能误伤正常 WA)', () => {
    const r = parseSpjExit(1, '', 'wrong answer', 10)
    expect(r.status).toBe('WA')
  })
})
