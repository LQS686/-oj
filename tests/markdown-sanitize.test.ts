/**
 * tests/markdown-sanitize.test.ts
 * Markdown sanitize schema（lib/markdown/sanitize-schema.ts）安全过滤单元测试
 *
 * 验证：style 属性 / script 标签 / on* 事件处理器 / javascript: 链接均被剥离，
 * 同时 KaTeX MathML 标签与 className 属性（渲染必需）得以保留。
 */
import { describe, it, expect } from 'vitest'
import { fromHtml } from 'hast-util-from-html'
import { sanitize } from 'hast-util-sanitize'
import { markdownSanitizeSchema } from '@/lib/markdown/sanitize-schema'

/** 对 HTML 片段执行 sanitize 后，汇总树中保留的标签、属性与 href */
function sanitizeHtml(html: string) {
  const tree = fromHtml(html, { fragment: true })
  const clean = sanitize(tree, markdownSanitizeSchema)
  const tags: string[] = []
  const attrs: Record<string, string[]> = {}
  const hrefs: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'element') {
      tags.push(node.tagName)
      attrs[node.tagName] = Object.keys(node.properties || {})
      if (typeof node.properties?.href === 'string') {
        hrefs.push(node.properties.href)
      }
    }
    for (const child of node.children || []) walk(child)
  }
  walk(clean)
  return { tags, attrs, hrefs }
}

describe('markdownSanitizeSchema：禁止 style 属性', () => {
  it('剥离 span 上的 style（含 UI 覆盖与外部请求 CSS）', () => {
    const { attrs } = sanitizeHtml('<span style="color:red;position:fixed;background-image:url(&quot;https://evil.example/x&quot;)">x</span>')
    expect(attrs.span).toBeDefined()
    expect(attrs.span).not.toContain('style')
  })
  it('任意标签上都不允许 style（含 div/table/img 白名单标签）', () => {
    const { attrs } = sanitizeHtml('<div style="color:red">d</div><table style="width:100%"><tr><td style="text-align:center">t</td></tr></table><img src="https://example.com/a.png" style="opacity:0">')
    for (const list of Object.values(attrs)) {
      expect(list).not.toContain('style')
    }
  })
})

describe('markdownSanitizeSchema：禁止脚本与事件处理器', () => {
  it('移除 script 标签', () => {
    const { tags } = sanitizeHtml('<script>alert(1)</script><p>ok</p>')
    expect(tags).not.toContain('script')
    expect(tags).toContain('p')
  })
  it('剥离 img 上的 onerror 等 on* 事件属性', () => {
    const { attrs } = sanitizeHtml('<img src="https://example.com/a.png" onerror="alert(1)" onload="steal()">')
    expect(attrs.img).toBeDefined()
    expect(attrs.img).not.toContain('onerror')
    expect(attrs.img).not.toContain('onload')
  })
})

describe('markdownSanitizeSchema：禁止危险协议链接', () => {
  it('剥离 javascript: 链接的 href', () => {
    const { hrefs } = sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="https://example.com">y</a>')
    expect(hrefs).toEqual(['https://example.com'])
  })
  it('剥离 img src 上的 javascript: 协议', () => {
    const { attrs } = sanitizeHtml('<img src="javascript:alert(1)">')
    expect(attrs.img).toBeDefined()
    expect(attrs.img).not.toContain('src')
  })
})

describe('markdownSanitizeSchema：渲染必需内容保留（回归）', () => {
  it('保留 KaTeX MathML 标签', () => {
    const { tags } = sanitizeHtml('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>')
    for (const tag of ['math', 'mrow', 'mi', 'mo', 'mn']) {
      expect(tags).toContain(tag)
    }
  })
  it('保留 className 属性（HTML class → hast className）', () => {
    const { attrs } = sanitizeHtml('<code class="math-inline">x</code>')
    expect(attrs.code).toContain('className')
  })
})
