import { describe, it, expect } from 'vitest'
import { compareOutput } from '@/lib/judge/comparator'
import type { CompareInput, CompareResult } from '@/lib/judge/types'

const FULL = 100

async function cmp(
  userOutput: string,
  expectedOutput: string,
  comparisonMode: CompareInput['comparisonMode'],
  realPrecision?: number,
): Promise<CompareResult> {
  return compareOutput({ userOutput, expectedOutput, fullScore: FULL, comparisonMode, realPrecision })
}

describe('compareOutput - default 模式', () => {
  it('完全匹配 → AC 且得满分', async () => {
    const r = await cmp('hello\nworld', 'hello\nworld', 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('行尾空格容忍（逐行 trimEnd）', async () => {
    const r = await cmp('hello   \nworld  ', 'hello\nworld', 'default')
    expect(r.status).toBe('AC')
  })

  it('行末换行容忍（尾部多余换行）', async () => {
    const r = await cmp('hello\n\n', 'hello', 'default')
    expect(r.status).toBe('AC')
  })

  it('单行末尾换行容忍', async () => {
    const r = await cmp('hello\n', 'hello', 'default')
    expect(r.status).toBe('AC')
  })

  it('大小写敏感（无忽略大小写选项）', async () => {
    const r = await cmp('Hello\nWorld', 'hello\nworld', 'default')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })

  it('内容不匹配 → WA，消息含行号', async () => {
    const r = await cmp('hello\nworlD', 'hello\nworld', 'default')
    expect(r.status).toBe('WA')
    expect(r.message).toContain('第 2 行')
  })
})

describe('compareOutput - strict 模式', () => {
  it('精确字节匹配（无尾随换行）→ AC', async () => {
    const r = await cmp('a\nb', 'a\nb', 'strict')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('行尾空格不容忍 → WA', async () => {
    const r = await cmp('hello \n', 'hello\n', 'strict')
    expect(r.status).toBe('WA')
  })

  it('选手输出过多 → OLE', async () => {
    const r = await cmp('a\nb', 'a', 'strict')
    expect(r.status).toBe('OLE')
  })

  it('选手输出不足 → WA，消息含"不足"', async () => {
    const r = await cmp('a', 'a\nb', 'strict')
    expect(r.status).toBe('WA')
    expect(r.message).toContain('不足')
  })

  it('内容不匹配 → WA', async () => {
    const r = await cmp('b', 'a', 'strict')
    expect(r.status).toBe('WA')
  })
})

describe('compareOutput - ignore-spaces 模式', () => {
  it('多余空格容忍 → AC', async () => {
    const r = await cmp('1  2  3', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('AC')
  })

  it('制表符容忍 → AC', async () => {
    const r = await cmp('1\t2\t3', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('AC')
  })

  it('token 不匹配 → WA', async () => {
    const r = await cmp('1 2 4', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('WA')
  })

  it('选手输出不足 → WA，消息含"不足"', async () => {
    const r = await cmp('1 2', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('WA')
    expect(r.message).toContain('不足')
  })

  it('选手输出过多 → OLE', async () => {
    const r = await cmp('1 2 3 4', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('OLE')
  })

  it('token 匹配但换行不一致 → PE', async () => {
    // 选手把 "a b c" 写成 "a\nb c"（b 前误换行）：token 全等，但行号不一致 → Presentation Error
    const r = await cmp('a\nb c', 'a b c', 'ignore-spaces')
    expect(r.status).toBe('PE')
  })
})

describe('compareOutput - real-number 模式', () => {
  it('浮点数在 eps 内 → AC（1.0000001 == 1.0，默认精度 3）', async () => {
    const r = await cmp('1.0000001', '1.0', 'real-number')
    expect(r.status).toBe('AC')
  })

  it('浮点数差异超过 eps → WA（默认精度 3）', async () => {
    const r = await cmp('3.14', '3.15', 'real-number')
    expect(r.status).toBe('WA')
  })

  it('精度 7：1.00000001 == 1.0（差异在 eps 内）→ AC', async () => {
    const r = await cmp('1.00000001', '1.0', 'real-number', 7)
    expect(r.status).toBe('AC')
  })

  it('精度 7 边界：1.0000002 != 1.0 → WA', async () => {
    const r = await cmp('1.0000002', '1.0', 'real-number', 7)
    expect(r.status).toBe('WA')
  })

  it('科学计数法解析', async () => {
    const r = await cmp('1e3 2e-1', '1000 0.2', 'real-number')
    expect(r.status).toBe('AC')
  })

  it('负数比较', async () => {
    const r = await cmp('-1.5 -2.5', '-1.5 -2.5', 'real-number')
    expect(r.status).toBe('AC')
  })

  it('多个数字全部在 eps 内 → AC', async () => {
    const r = await cmp('1.0 2.0 3.0', '1 2 3', 'real-number')
    expect(r.status).toBe('AC')
  })

  it('无效数字格式（带尾部垃圾）→ WA', async () => {
    const r = await cmp('3.14abc', '3.14', 'real-number')
    expect(r.status).toBe('WA')
    expect(r.message).toContain('无效的数字格式')
  })
})

describe('compareOutput - 边界', () => {
  it('双方空输入 → AC 得满分', async () => {
    const r = await cmp('', '', 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('选手空输入、标准非空 → WA', async () => {
    const r = await cmp('', 'hello', 'default')
    expect(r.status).toBe('WA')
  })

  it('超长输出完全匹配 → AC（跨 128KB 缓冲区）', async () => {
    const long = Array.from({ length: 20000 }, (_, i) => 'line ' + i).join('\n')
    const r = await cmp(long, long, 'default')
    expect(r.status).toBe('AC')
  })

  it('超长输出中部不匹配 → WA', async () => {
    const expected = Array.from({ length: 20000 }, (_, i) => 'line ' + i).join('\n')
    const user = Array.from({ length: 20000 }, (_, i) =>
      i === 10000 ? 'line WRONG' : 'line ' + i,
    ).join('\n')
    const r = await cmp(user, expected, 'default')
    expect(r.status).toBe('WA')
  })
})
