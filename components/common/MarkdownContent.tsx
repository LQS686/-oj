'use client'

import { useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import type { ExtraProps } from 'react-markdown'
import { markdownSanitizeSchema } from '@/lib/markdown/sanitize-schema'
import { normalizeLatexDelimiters } from '@/lib/markdown/delimiters'
import MarkdownCodeBlock from '@/components/common/MarkdownCodeBlock'

interface MarkdownContentProps {
  content: string
  className?: string
}

// 模块级渲染缓存（LRU）：题目页切换 tab 时 AnimatePresence 会卸载/重挂载
// ProblemDescription，若每次挂载都重跑 remark/rehype/KaTeX 全管线，大题面
// 会阻塞主线程数百毫秒~数秒。缓存 key 为归一化后的内容，渲染结果（ReactNode）
// 可安全跨挂载复用（同一输入输出完全确定，无 hydration 风险）。
const renderCache = new Map<string, ReactNode>()
const RENDER_CACHE_MAX = 24

export default function MarkdownContent({
  content,
  className = '',
}: MarkdownContentProps) {
  const processedContent = useMemo(() => {
    if (!content) return ''
    const normalized = normalizeLatexDelimiters(content)
    const cached = renderCache.get(normalized)
    if (cached !== undefined) {
      // 命中后重插以保持 LRU 顺序（Map.get 不更新迭代顺序）
      renderCache.delete(normalized)
      renderCache.set(normalized, cached)
      return cached
    }
    const rendered = (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // rehype 插件顺序（react-markdown 官方推荐组合，顺序不可乱）：
        //   1. rehype-raw：解析题面中的原生 HTML（Hydro/FPS/Codeforces 导出题面常见
        //      <h2>/<p>/<img>/<font> 等）。只处理 raw 节点，不影响 remark-math 生成的
        //      math 代码节点，故放在最前。
        //   2. rehype-sanitize：按白名单过滤用户 HTML（剥离 script/on*/style 等），
        //      schema 保留 code + className 与 KaTeX MathML 标签，remark-math 生成的
        //      <code class="language-math math-inline"> 节点完整保留。
        //   3. rehype-katex：最后把 math 节点渲染为 KaTeX HTML。因在 sanitize 之后，
        //      KaTeX 输出的内联 style（strut height、上下标 vertical-align/top、
        //      分数分子分母定位等）不会被剥离——这些样式一旦丢失就会导致
        //      公式布局塌陷（上下标不缩放、分数重叠）。若 sanitize 在 katex 之后，
        //      KaTeX 的关键样式会被过滤，出现「上标与正文字号一致、分数分子分母与
        //      分数线重叠、下标比字母还大」等异常。
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, markdownSanitizeSchema],
          [rehypeKatex, { strict: 'ignore' }],
        ]}
        components={{
          // 去掉默认 <pre> 外壳，避免与 SyntaxHighlighter 叠成「深色外框 + 浅色内容」
          pre({ children }) {
            return <>{children}</>
          },
          code({
            className,
            children,
            ...props
          }: ComponentPropsWithoutRef<'code'> & ExtraProps) {
            // 防御：若 math 节点未被 rehype-katex 转换（正常不会发生），
            // 按行内文本展示而不是渲染成带 "Math" 标签的代码块
            if (
              className &&
              /(?:^|\s)(?:language-math|math-inline|math-display)(?:\s|$)/.test(
                className
              )
            ) {
              return <span className="markdown-math-unrendered">{children}</span>
            }
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : 'text'
            const codeString = String(children).replace(/\n$/, '')
            // 有语言标记、或多行内容 → 按块级代码渲染（含无语言围栏 ```）
            const isBlock = Boolean(match) || codeString.includes('\n')

            if (isBlock) {
              return <MarkdownCodeBlock language={language} code={codeString} />
            }

            return (
              <code
                className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-border">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border border-border px-4 py-2 bg-muted text-left font-semibold">
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className="border border-border px-4 py-2">{children}</td>
            )
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    )
    if (renderCache.size >= RENDER_CACHE_MAX) {
      const oldest = renderCache.keys().next().value
      if (oldest !== undefined) renderCache.delete(oldest)
    }
    renderCache.set(normalized, rendered)
    return rendered
  }, [content])

  return (
    <div className={`markdown-body ${className}`}>{processedContent}</div>
  )
}
