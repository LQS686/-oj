'use client'

import { useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import type { ExtraProps } from 'react-markdown'
import { markdownSanitizeSchema } from '@/lib/markdown/sanitize-schema'
import MarkdownCodeBlock from '@/components/common/MarkdownCodeBlock'

interface MarkdownContentProps {
  content: string
  className?: string
}

/**
 * 归一化 LaTeX 公式定界符。
 *
 * 官方 remark-math 只识别 `$...$`（行内）与 `$$...$$`（块级），但题面里
 * 还存在标准 LaTeX 写法 `\(...\)` 与 `\[...\]`（Codeforces/Hydro 等导出的
 * 题面常见）。这里做一次最小且安全的转换：
 *   \(...\) → $...$   （行内公式）
 *   \[...\] → $$...$$ （块级公式，可跨行、可含 `\\` 换行）
 *
 * 安全设计：
 *   1. 先保护代码块（围栏 / 行内），归一化正则永远看不到代码内容；
 *   2. 只做定界符替换，不改写任何公式内容；
 *   3. 不做「裸 LaTeX 命令」启发式包裹——历史版本的正则会把
 *      `C:\Windows\System32`、英文句子等误包成公式，导致红色 KaTeX 错误
 *      （该写法非常规，应使用 `$...$` 显式包裹）。
 */
function normalizeLatexDelimiters(content: string): string {
  if (!content) return content

  const placeholders: string[] = []
  const protect = (match: string) => {
    const idx = placeholders.length
    placeholders.push(match)
    return `\x00CODE_${idx}\x00`
  }

  // 1. 保护代码块（先围栏后行内；占位符不含反引号，互不干扰）
  let text = content.replace(/```[\s\S]*?```/g, protect)
  text = text.replace(/`[^`\n]+`/g, protect)

  // 2. 块级公式 \[...\] → $$...$$（非贪婪匹配到第一个 \]，多行内容安全）
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner: string) => `$$${inner}$$`)

  // 3. 行内公式 \(...\) → $...$
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner: string) => `$${inner}$`)

  // 4. 还原代码块
  placeholders.forEach((m, i) => {
    text = text.split(`\x00CODE_${i}\x00`).join(m)
  })
  return text
}

export default function MarkdownContent({
  content,
  className = '',
}: MarkdownContentProps) {
  const processedContent = useMemo(() => {
    if (!content) return ''
    return normalizeLatexDelimiters(content)
  }, [content])

  return (
    <div className={`markdown-body ${className}`}>
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
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
