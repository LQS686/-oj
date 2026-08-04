/**
 * tests/markdown-delimiters.test.ts
 * LaTeX 定界符归一化（lib/markdown/delimiters.ts）回归测试。
 *
 * 覆盖曾出现的真实渲染 bug：
 *   1. \[...\] 内嵌 \(...\) 被二次转换 → 裸 $ 进 KaTeX → ParseError 红色错误框；
 *   2. \[...\] / \(...\) 跨空行配对 → 段落间残留孤立 $ 或 ParseError；
 *   3. `\\[0.5em]`（LaTeX 换行+间距）被误判为块级定界符开头 → 与文末 \] 错配。
 */
import { describe, it, expect } from 'vitest'
import { normalizeLatexDelimiters } from '@/lib/markdown/delimiters'

describe('normalizeLatexDelimiters：基础转换', () => {
  it('(...) → $...$（行内）', () => {
    expect(normalizeLatexDelimiters('求 \\(a_i\\) 的值')).toBe('求 $a_i$ 的值')
  })

  it('[...] → $$...$$（块级，可跨行）', () => {
    expect(normalizeLatexDelimiters('\\[\n\\int_0^1 dx\n\\]')).toBe('$$\n\\int_0^1 dx\n$$')
  })

  it('空字符串原样返回', () => {
    expect(normalizeLatexDelimiters('')).toBe('')
  })
})

describe('normalizeLatexDelimiters：修复回归（曾为真实 bug）', () => {
  it('[...] 内嵌 (...) 不再二次转换，展开为普通括号', () => {
    const input = '\\[\n\\begin{aligned}\nx &= \\(a + b\\)\n\\end{aligned}\n\\]'
    const out = normalizeLatexDelimiters(input)
    // 块级整体转为 $$...$$，内部 \(a+b\) 展开为 (a+b)，不残留裸 $
    expect(out.startsWith('$$')).toBe(true)
    expect(out.endsWith('$$')).toBe(true)
    expect(out).toContain('(a + b)')
    expect(out).not.toContain('$a + b$')
  })

  it('[...] 跨空行不配对（避免 ParseError）', () => {
    const input = '\\[ A = 1\n\nB = 2 \\] 结束'
    const out = normalizeLatexDelimiters(input)
    // 保持原文（含定界符），不生成 $$ 或孤立 $
    expect(out).toBe(input)
    expect(out).not.toContain('$$')
  })

  it('(...) 跨空行不配对（避免孤立 $）', () => {
    const input = '第一段 \\( x = 1\n\n第二段 y = 2 \\) 结束'
    const out = normalizeLatexDelimiters(input)
    expect(out).toBe(input)
    expect(out).not.toContain('$')
  })

  it('\\[0.5em] 换行+间距写法不被误判为块级定界符', () => {
    const input = '$$\n\\begin{aligned}\na &= b \\\\[0.5em]\nc &= d\n\\end{aligned}\n$$'
    expect(normalizeLatexDelimiters(input)).toBe(input)
  })
})

describe('normalizeLatexDelimiters：保护代码块', () => {
  it('围栏代码块内的定界符不受影响', () => {
    const input = '```cpp\n// \\(x\\) \\[y\\]\nint a;\n```\n\n后文 \\(z\\)'
    const out = normalizeLatexDelimiters(input)
    // 代码块内容原样保留
    expect(out).toContain('// \\(x\\) \\[y\\]')
    // 代码块外的 \(z\) 正常转换
    expect(out).toContain('后文 $z$')
  })

  it('行内代码内的美元符/定界符不受影响', () => {
    const input = '使用 `$a$` 语法\n\n真实公式 $b$'
    const out = normalizeLatexDelimiters(input)
    expect(out).toContain('`$a$`')
    expect(out).toContain('$b$')
  })

  it('~~~ 围栏代码块内的定界符不受影响', () => {
    const input = '~~~cpp\n// \\(x\\) \\[y\\]\nint a;\n~~~\n\n后文 \\(z\\)'
    const out = normalizeLatexDelimiters(input)
    expect(out).toContain('// \\(x\\) \\[y\\]')
    expect(out).toContain('后文 $z$')
  })
})

describe('normalizeLatexDelimiters：CRLF 兼容', () => {
  it('CRLF 换行的 [...] 跨空行不配对（避免 ParseError）', () => {
    const input = '\\[ A = 1\r\n\r\nB = 2 \\] 结束'
    const out = normalizeLatexDelimiters(input)
    expect(out).toBe(input)
    expect(out).not.toContain('$$')
  })

  it('CRLF 换行的 (...) 正常转换', () => {
    const input = '求 \\(a_i\\)\r\n的值'
    const out = normalizeLatexDelimiters(input)
    expect(out).toContain('$a_i$')
  })
})
