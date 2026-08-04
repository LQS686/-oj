/**
 * tests/katex-compat.test.ts
 * KaTeX 版本一致性回归保护。
 *
 * 背景：项目曾出现「上下标不缩放」——顶层 katex@0.18.1（CSS 来源）与
 * rehype-katex 内部 katex@0.16.47（HTML 来源）版本错配：
 * 0.18 的 CSS 用自定义元素选择器（`vlist-t{...}`，匹配 <vlist-t> 标签），
 * 无法匹配 0.16 生成的 `<span class="vlist-t">` class 结构，导致上下标
 * 布局/字号缩放规则全部失效。
 *
 * 本测试断言三件事，任一回归（升级 0.18 CSS、rehype-katex 依赖范围变化
 * 导致双实例）都会失败：
 *   1. node_modules/katex 为 0.16.x（与 rehype-katex 内部一致）；
 *   2. katex.min.css 使用 class 选择器 `.vlist-t{`（而非 0.18 元素选择器）；
 *   3. 渲染出的公式 HTML 含 `vlist-t` 与 `sizing reset-size6 size3` 类。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'

// ESM 下 __dirname 不可用（vitest 内联注入不跨版本稳定），用 import.meta.dirname
const root = import.meta.dirname
  ? path.resolve(import.meta.dirname, '..')
  : process.cwd()

describe('KaTeX 版本一致性（上下标缩放回归保护）', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules/katex/package.json'), 'utf8')
  )
  const katexCss = fs.readFileSync(
    path.join(root, 'node_modules/katex/dist/katex.min.css'),
    'utf8'
  )

  it('katex 为 0.16.x（与 rehype-katex 内部一致，避免 0.18 CSS 错配）', () => {
    expect(pkg.version).toMatch(/^0\.16\./)
  })

  it('CSS 使用 class 选择器 .vlist-t（而非 0.18 的自定义元素选择器 vlist-t）', () => {
    expect(katexCss).toContain('.vlist-t{')
  })

  it('CSS 含上下标字号缩放规则（sizing reset-size6 size3 → 0.7em）', () => {
    expect(katexCss).toContain('sizing.reset-size6.size3{font-size:.7em}')
  })

  it('渲染出的公式 HTML 含上下标结构类（vlist-t / sizing reset-size6 size3）', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkGfm, remarkMath],
        rehypePlugins: [rehypeRaw, [rehypeKatex, { strict: 'ignore' }]],
      }, '$x^2 + a_i$')
    )
    expect(html).toContain('class="vlist-t')
    expect(html).toContain('sizing reset-size6 size3')
  })
})
