'use client'

import { useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
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
 * 预处理：把「裸 LaTeX 命令」（未用 $...$ 包裹的 \le、\times 等）自动包成行内公式，
 * 让题目信息里的 \le 等写法无需手动加 $ 也能渲染。
 *
 * 安全设计（修复早期被移除的预处理的缺陷）：
 *  1. 先把代码块（围栏/行内）与已有公式（$...$/$$...$$）替换为占位符，
 *     包裹正则永远看不到被保护区域 → 不会破坏块级公式（旧版正是在这里出错）；
 *  2. 只包裹「含反斜杠字母命令」的连续 ASCII 片段，并做长度/内容约束，
 *     避免把普通英文句子误当公式；
 *  3. 处理末尾转义标点（\% 等）残留的反斜杠。
 */
function preprocessLatex(content: string): string {
 if (!content) return content

 const placeholders: string[] = []
 const protect = (match: string) => {
  const idx = placeholders.length
  placeholders.push(match)
  return `\x00MATH_${idx}\x00`
 }

 // 1. 保护代码块（先围栏后行内；占位符不含反引号，互不干扰）
 let text = content.replace(/```[\s\S]*?```/g, protect)
 text = text.replace(/`[^`\n]+`/g, protect)

 // 2. 保护已有公式，确保它们原样保留
 text = text.replace(/\$\$[\s\S]+?\$\$/g, protect)
 text = text.replace(/\$[^$\n]+\$/g, protect)

 // 3. 包裹裸 LaTeX：连续 ASCII 数学字符片段（含反斜杠），其中至少含一个命令
 const BARE_RUN = /[A-Za-z0-9\\+*/=<>()[\],.^_{}\- ]{1,64}/g
 text = text.replace(BARE_RUN, (run) => {
  if (!/\\[a-zA-Z]/.test(run)) return run // 不含命令 → 原样
  const trimmed = run.trim()
  if (!trimmed) return run
  // 长度保护：过长且不含数字的片段视为普通英文句子，不包裹
  if (trimmed.length > 24 && !/\d/.test(trimmed)) return run
  // 剥离尾部反斜杠（\%、\_ 等转义标点的残余），避免把孤立的 \ 包进公式
  const stripped = trimmed.replace(/\\+$/, '')
  if (!stripped || !/\\[a-zA-Z]/.test(stripped)) return run
  const tailN = trimmed.length - stripped.length
  const coreStart = run.indexOf(trimmed)
  const leading = run.slice(0, coreStart)
  const trailing = run.slice(coreStart + trimmed.length)
  return leading + `$${stripped}$` + '\\'.repeat(tailN) + trailing
 })

 // 4. 还原占位符
 placeholders.forEach((m, i) => {
  text = text.split(`\x00MATH_${i}\x00`).join(m)
 })
 return text
}

export default function MarkdownContent({
 content,
 className = ''
}: MarkdownContentProps) {
 const processedContent = useMemo(() => {
  if (!content) return ''
  // 裸 LaTeX 自动包裹（安全预处理，不影响已有 $...$/$$...$$ 公式）
  return preprocessLatex(content)
 }, [content])

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
 // 去掉默认 <pre> 外壳，避免与 SyntaxHighlighter 叠成「深色外框 + 浅色内容」
 pre({ children }) {
  return <>{children}</>
 },
 code({className, children, ...props}: ComponentPropsWithoutRef<'code'> & ExtraProps) {
 const match = /language-(\w+)/.exec(className || '')
 const language = match ? match[1] : 'text'
 const codeString = String(children).replace(/\n$/, '')
 // 有语言标记、或多行内容 → 按块级代码渲染（含无语言围栏 ```）
 const isBlock = Boolean(match) || codeString.includes('\n')

 if (isBlock) {
  return <MarkdownCodeBlock language={language} code={codeString} />
 }

 return (
 <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 font-mono text-[0.85em]" {...props}>
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
 return <th className="border border-border px-4 py-2 bg-muted text-left font-semibold">{children}</th>
 },
 td({ children }) {
 return <td className="border border-border px-4 py-2">{children}</td>
 },
 blockquote({ children }) {
 return <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">{children}</blockquote>
 },
 }}
 >
 {processedContent}
 </ReactMarkdown>
 </div>
 )
}
