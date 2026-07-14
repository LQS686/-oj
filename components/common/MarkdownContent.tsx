import { useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ExtraProps } from 'react-markdown'

interface MarkdownContentProps {
 content: string
 className?: string
 preprocessContent?: boolean
}

export default function MarkdownContent({ 
 content, 
 className = '',
 preprocessContent = false
}: MarkdownContentProps) {
 const processedContent = useMemo(() => {
 if (!content) return ''
 
 if (!preprocessContent) return content
 
 let text = content

 const codeBlocks: string[] = []
 let codeIndex = 0

 text = text.replace(/```[\s\S]*?```/g, (match) => {
 const placeholder = `\x00CODEBLOCK_${codeIndex++}\x00`
 codeBlocks.push(match)
 return placeholder
 })

 text = text.replace(/`[^`\n]+`/g, (match) => {
 const placeholder = `\x00CODEBLOCK_${codeIndex++}\x00`
 codeBlocks.push(match)
 return placeholder
 })

 text = text.replace(/\$\$[\s\S]+?\$\$/g, (match) => match)
 text = text.replace(/\$[^$\n]+\$/g, (match) => match)

 text = text.replace(/(\d+)\^(\d+)/g, '$$$1^{$2}$$')
 
 text = text.replace(/\b([a-zA-Z])\^(\d)\b/g, '$$$1^{$2}$$')
 text = text.replace(/\b([a-zA-Z])\^([a-zA-Z])\b/g, '$$$1^{$2}$$')

 for (let i = 0; i < codeBlocks.length; i++) {
 const placeholder = `\x00CODEBLOCK_${i}\x00`
 text = text.replace(placeholder, codeBlocks[i])
 }

 return text
 }, [content, preprocessContent])

 return (
 <div className={`markdown-body ${className}`}>
 <ReactMarkdown
 remarkPlugins={[remarkGfm, remarkMath]}
 rehypePlugins={[rehypeSanitize, rehypeKatex]}
 components={{
 code({className, children, ...props}: ComponentPropsWithoutRef<'code'> & ExtraProps) {
 const match = /language-(\w+)/.exec(className || '')
 const language = match ? match[1] : ''
 const codeString = String(children).replace(/\n$/, '')

 if (match) {
  try {
  return (
  <SyntaxHighlighter
  style={vscDarkPlus}
  language={language}
  PreTag="div"
  className="rounded-lg"
  >
  {codeString}
  </SyntaxHighlighter>
  )
  } catch {
  return (
  <SyntaxHighlighter
  style={vscDarkPlus}
  language="text"
  PreTag="div"
  className="rounded-lg"
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
