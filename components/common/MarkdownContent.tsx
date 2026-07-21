import { useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ExtraProps } from 'react-markdown'
import { markdownSanitizeSchema } from '@/lib/markdown/sanitize-schema'

interface MarkdownContentProps {
 content: string
 className?: string
 /**
  * 是否启用预处理（数学公式上标增强）。
  *
  * 已废弃：原预处理逻辑会破坏 KaTeX 块级公式 `$$...$$` 内部的字符
  * （如 `\sum_{i=1}^n` 中的 `^` 会被误替换为 `$a^b$` 形式）。
  * remark-math 已能正确解析 `$...$` 和 `$$...$$`，无需额外预处理。
  * 保留参数仅为向后兼容，新调用应默认 false。
  */
 preprocessContent?: boolean
}

export default function MarkdownContent({
 content,
 className = '',
 preprocessContent = false
}: MarkdownContentProps) {
 const processedContent = useMemo(() => {
 if (!content) return ''

 // 预处理已废弃：原逻辑会破坏 KaTeX 块级公式
 // remark-math 插件已能正确解析 $...$ 和 $$...$$，无需手动预处理
 // 保留参数仅为向后兼容，实际不做任何处理
 if (!preprocessContent) return content

 return content
 }, [content, preprocessContent])

 return (
 <div className={`markdown-body ${className}`}>
 <ReactMarkdown
 remarkPlugins={[remarkGfm, remarkMath]}
 // rehype 插件顺序（关键，顺序错误会导致 KaTeX 不渲染）：
 //   1. rehype-katex：把 remark-math 生成的 <code className="math-display/math-inline"> 节点
 //      转换为 KaTeX 输出的 HTML（含 .katex / .katex-mathml / .katex-html 结构）
 //   2. rehype-sanitize：最后做安全过滤，schema 中已加 KaTeX 输出所需的全部标签
 //
 // 不使用 rehype-raw：
 //   rehype-raw 会重新解析 KaTeX 输出的 HTML 字符串（含 <math> MathML 部分），
 //   破坏 KaTeX 渲染结果，导致 DOM 中出现 <math> 但缺少 .katex 类。
 //   原始 Markdown 已支持 GFM（表格/任务列表/删除线等），题面无需嵌入 HTML。
 //   若未来要兼容 Hydro 题面（含原生 HTML），需用 rehype-raw 时必须放在
 //   rehype-katex 之前，并解决 math 节点 className 被剥离的问题（参考 remark-math 文档）。
 rehypePlugins={[
 rehypeKatex,
 [rehypeSanitize, markdownSanitizeSchema],
 ]}
 components={{
 code({className, children, ...props}: ComponentPropsWithoutRef<'code'> & ExtraProps) {
 const match = /language-(\w+)/.exec(className || '')
 const language = match ? match[1] : ''
 const codeString = String(children).replace(/\n$/, '')

 if (match) {
  // 使用浅色主题（oneLight），与题面浅色背景融合
  // 避免 vscDarkPlus 深色主题在浅色题面中突兀（用户反馈）
  try {
  return (
  <SyntaxHighlighter
  style={oneLight}
  language={language}
  PreTag="div"
  className="rounded-lg text-sm"
  >
  {codeString}
  </SyntaxHighlighter>
  )
  } catch {
  return (
  <SyntaxHighlighter
  style={oneLight}
  language="text"
  PreTag="div"
  className="rounded-lg text-sm"
  >
  {codeString}
  </SyntaxHighlighter>
  )
  }
 }

 return (
 <code className="bg-primary/10 text-primary-light px-1.5 py-0.5 rounded border border-primary/20 font-mono text-[0.85em]" {...props}>
 {children}
 </code>
 )
},
 table({ children }) {
 return (
 <div className="overflow-x-auto my-4">
 <table className="min-w-full border-collapse border border-slate-600">
 {children}
 </table>
 </div>
 )
 },
 th({ children }) {
 return <th className="border border-slate-600 px-4 py-2 bg-slate-700 text-left font-semibold">{children}</th>
 },
 td({ children }) {
 return <td className="border border-slate-600 px-4 py-2">{children}</td>
 },
 blockquote({ children }) {
 return <blockquote className="border-l-4 border-primary pl-4 italic text-slate-400">{children}</blockquote>
 },
 }}
 >
 {processedContent}
 </ReactMarkdown>
 </div>
 )
}
