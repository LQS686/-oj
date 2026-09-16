import { describe, it, expect } from 'vitest'
import { compareOutput } from '@/lib/judge/comparator'
import type { CompareInput, CompareResult } from '@/lib/judge/types'

const FULL = 100

async function cmp(
  userOutput: string,
  expectedOutput: string,
  comparisonMode: CompareInput['comparisonMode'],
  realPrecision?: number
): Promise<CompareResult> {
  return compareOutput({
    userOutput,
    expectedOutput,
    fullScore: FULL,
    comparisonMode,
    realPrecision,
  })
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

  // 与 strict / ignore-spaces / real-number 一致：多输出内容判 OLE，而非 WA
  it('选手多输出非空内容 → OLE', async () => {
    const r = await cmp('a\nb', 'a', 'default')
    expect(r.status).toBe('OLE')
    expect(r.score).toBe(0)
  })

  // default 的空格口径：仅「行尾」多余空格可忽略，「中间间隔空格数」必须一致
  it('行内多余空格（中间间隔空格数不符）→ WA，不得判 AC', async () => {
    const r = await cmp('1  2  3', '1 2 3', 'default')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })

  it('行尾多余空格 → AC（仅尾部可忽略）', async () => {
    const r = await cmp('1 2 3   ', '1 2 3', 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('每行行尾多余空格 → AC', async () => {
    const r = await cmp('1 2  \n3 4\t', '1 2\n3 4', 'default')
    expect(r.status).toBe('AC')
  })

  it('多输出的仍是空白行 → 容忍 AC（不误判 OLE）', async () => {
    const r = await cmp('a\n   \n\n', 'a', 'default')
    expect(r.status).toBe('AC')
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

  it('行内多余空格 → WA', async () => {
    const r = await cmp('1  2', '1 2', 'strict')
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

  it('标准答案 2 行、选手 4 行（token 全等但行结构不同）→ PE', async () => {
    // 答案契约是「两行、行内空格分隔」；选手写成 4 行属于格式错误，不得判 AC
    const r = await cmp('1\n2\n3\n4', '1 2\n3 4', 'ignore-spaces')
    expect(r.status).toBe('PE')
    expect(r.score).toBe(0)
    expect(r.message).toContain('行格式错误')
  })

  it('多行与单行的 token 序列相同 → PE（行结构不符）', async () => {
    const r = await cmp('1\n2\n3\n', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('PE')
    expect(r.score).toBe(0)
  })

  it('token 之间换行位置不同 → PE', async () => {
    const r = await cmp('a\nb c', 'a b c', 'ignore-spaces')
    expect(r.status).toBe('PE')
    expect(r.score).toBe(0)
  })

  it('行内多余空格/制表符仍容忍 → AC（该模式的主要用途）', async () => {
    const r = await cmp('1  2\t3', '1 2 3', 'ignore-spaces')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('换行把「中文」切成两个 token → WA（token 内容被改变，不是格式差异）', async () => {
    const r = await cmp('中\n文 测 试', '中文 测试', 'ignore-spaces')
    expect(r.status).toBe('WA')
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
      i === 10000 ? 'line WRONG' : 'line ' + i
    ).join('\n')
    const r = await cmp(user, expected, 'default')
    expect(r.status).toBe('WA')
  })

  it('userOutputPath 文件流比对 → AC', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const tmp = path.join(os.tmpdir(), `dsoj-cmp-${Date.now()}.txt`)
    await fs.writeFile(tmp, '2\n3\n5\n', 'utf-8')
    try {
      const r = await compareOutput({
        userOutputPath: tmp,
        expectedOutput: '2\n3\n5\n',
        fullScore: FULL,
        comparisonMode: 'default',
      })
      expect(r.status).toBe('AC')
      expect(r.score).toBe(FULL)
    } finally {
      await fs.unlink(tmp).catch(() => {})
    }
  })

  it('双文件同步比对百万行级 → AC 且较快', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const n = 100_000
    const body = Array.from({ length: n }, (_, i) => String(i)).join('\n') + '\n'
    const dir = os.tmpdir()
    const user = path.join(dir, `dsoj-u-${Date.now()}.txt`)
    const exp = path.join(dir, `dsoj-e-${Date.now()}.txt`)
    await fs.writeFile(user, body)
    await fs.writeFile(exp, body)
    try {
      const t0 = Date.now()
      const r = await compareOutput({
        userOutputPath: user,
        expectedOutputPath: exp,
        fullScore: FULL,
        comparisonMode: 'default',
      })
      const ms = Date.now() - t0
      expect(r.status).toBe('AC')
      // 异步逐行路径在 1e5 行会远慢于此；同步路径应在数秒内
      expect(ms).toBeLessThan(5000)
    } finally {
      await fs.unlink(user).catch(() => {})
      await fs.unlink(exp).catch(() => {})
    }
  })
})

// B-P1-4：超长行（>1024 字节）不得截断比较，尾部差异必须判 WA
describe('compareOutput - 超长行（>1024 字节）', () => {
  it('字符串流：1500 字节行尾部差异 → WA（不得截断忽略尾部）', async () => {
    const base = 'a'.repeat(1499)
    const r = await cmp(base + 'X', base + 'Y', 'default')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })

  it('双文件同步比对：1500 字节行尾部差异 → WA', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const base = 'b'.repeat(1499)
    const user = path.join(os.tmpdir(), `dsoj-long-u-${Date.now()}.txt`)
    const exp = path.join(os.tmpdir(), `dsoj-long-e-${Date.now()}.txt`)
    await fs.writeFile(user, base + 'X', 'utf-8')
    await fs.writeFile(exp, base + 'Y', 'utf-8')
    try {
      const r = await compareOutput({
        userOutputPath: user,
        expectedOutputPath: exp,
        fullScore: FULL,
        comparisonMode: 'default',
      })
      expect(r.status).toBe('WA')
      expect(r.score).toBe(0)
    } finally {
      await fs.unlink(user).catch(() => {})
      await fs.unlink(exp).catch(() => {})
    }
  })

  it('strict 模式：1500 字节行尾部差异 → WA', async () => {
    const base = 'c'.repeat(1499)
    const r = await cmp(base + 'X', base + 'Y', 'strict')
    expect(r.status).toBe('WA')
  })

  // 超长行可精确比较：完全相同 → AC（修复前会被「无法精确比较」误判 WA）
  it('字符串流：1500 字节行完全相同 → AC', async () => {
    const base = 'a'.repeat(1500)
    const r = await cmp(base + '\n' + base, base + '\n' + base, 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('字符串流：远超 1024 字节（300KB 单行）完全相同 → AC', async () => {
    const base = 'a'.repeat(300 * 1024)
    const r = await cmp(base, base, 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('default 模式：超长行仅行尾空白差异 → AC（trimEnd 语义保持）', async () => {
    const base = 'a'.repeat(1500)
    const r = await cmp(base + '   ', base, 'default')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('strict 模式：1500 字节行完全相同 → AC', async () => {
    const base = 'c'.repeat(1500)
    const r = await cmp(base + '\nend', base + '\nend', 'strict')
    expect(r.status).toBe('AC')
    expect(r.score).toBe(FULL)
  })

  it('双文件同步比对：1500 字节行完全相同 → AC', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const base = 'b'.repeat(1500)
    const user = path.join(os.tmpdir(), `dsoj-long-ac-u-${Date.now()}.txt`)
    const exp = path.join(os.tmpdir(), `dsoj-long-ac-e-${Date.now()}.txt`)
    await fs.writeFile(user, base + '\n', 'utf-8')
    await fs.writeFile(exp, base + '\n', 'utf-8')
    try {
      const r = await compareOutput({
        userOutputPath: user,
        expectedOutputPath: exp,
        fullScore: FULL,
        comparisonMode: 'default',
      })
      expect(r.status).toBe('AC')
      expect(r.score).toBe(FULL)
    } finally {
      await fs.unlink(user).catch(() => {})
      await fs.unlink(exp).catch(() => {})
    }
  })
})

// B-P1-4：超长 token（>256 字节）不得截断比较，尾部差异必须判 WA
describe('compareOutput - 超长 token（>256 字节）', () => {
  it('ignore-spaces：300 字节 token 尾部差异 → WA（字符串流）', async () => {
    const base = '9'.repeat(299)
    const r = await cmp(base + '1', base + '2', 'ignore-spaces')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
    expect(r.message).toContain('token 长度超过 256')
  })

  it('ignore-spaces：双文件同步比对，300 字节 token 尾部差异 → WA', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const base = '8'.repeat(299)
    const user = path.join(os.tmpdir(), `dsoj-tok-u-${Date.now()}.txt`)
    const exp = path.join(os.tmpdir(), `dsoj-tok-e-${Date.now()}.txt`)
    await fs.writeFile(user, base + '1', 'utf-8')
    await fs.writeFile(exp, base + '2', 'utf-8')
    try {
      const r = await compareOutput({
        userOutputPath: user,
        expectedOutputPath: exp,
        fullScore: FULL,
        comparisonMode: 'ignore-spaces',
      })
      expect(r.status).toBe('WA')
      expect(r.score).toBe(0)
      expect(r.message).toContain('token 长度超过 256')
    } finally {
      await fs.unlink(user).catch(() => {})
      await fs.unlink(exp).catch(() => {})
    }
  })

  it('ignore-spaces：双方完全相同但 token 超长 → WA（截断无法证明相等）', async () => {
    const tok = '7'.repeat(300)
    const r = await cmp(tok, tok, 'ignore-spaces')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })

  it('real-number：300 字节数字 token 尾部差异 → WA', async () => {
    const base = '9'.repeat(299)
    const r = await cmp(base + '1', base + '2', 'real-number')
    expect(r.status).toBe('WA')
    expect(r.score).toBe(0)
  })
})

// 多字节字符横跨读取缓冲区边界时不得被拆成 U+FFFD（同步比对走 256KiB 直读缓冲）
describe('compareOutput - 多字节字符跨读取缓冲区边界', () => {
  it('两份内容仅空白对齐不同（其一恰好把「中」拆在 256KiB 边界）→ AC', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')

    // 同步读取缓冲为 256 KiB = 262144 字节。
    // 单元 'a  ' 恰好 3 字节：87381 * 3 = 262143，使其后第一个 token 从 262143 开始，
    // 于是「中」(3 字节) 的字节落在 262143/262144/262145 —— 正好被缓冲区边界切开。
    const PAD_UNITS = 87381
    const pad = 'a  '.repeat(PAD_UNITS)
    const cnTokens = Array.from({ length: 20000 }, () => '中文测试').join(' ')

    // std：中文 token 从 262143 开始（跨边界）；user：多一个空格（空白差异应被忽略），
    // 中文 token 从 262144 开始（与边界对齐）。两者 token 序列完全相同。
    const stdBody = pad + cnTokens
    const userBody = pad + ' ' + cnTokens

    const user = path.join(os.tmpdir(), `dsoj-utf8-u-${Date.now()}.txt`)
    const exp = path.join(os.tmpdir(), `dsoj-utf8-e-${Date.now()}.txt`)
    await fs.writeFile(user, userBody, 'utf-8')
    await fs.writeFile(exp, stdBody, 'utf-8')
    try {
      const r = await compareOutput({
        userOutputPath: user,
        expectedOutputPath: exp,
        fullScore: FULL,
        comparisonMode: 'ignore-spaces',
      })
      expect(r.status).toBe('AC')
      expect(r.score).toBe(FULL)
    } finally {
      await fs.unlink(user).catch(() => {})
      await fs.unlink(exp).catch(() => {})
    }
  })
})
