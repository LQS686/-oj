'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import dynamic from 'next/dynamic'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then((mod) => mod.Prism),
  { ssr: false }
)

import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

const SUPPORTED_LANGUAGES = new Set([
  'cpp',
  'c',
  'java',
  'python',
  'javascript',
  'typescript',
  'go',
  'rust',
])

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const components: Components = useMemo(
    () => ({
      h1({ children, ...props }) {
        return (
          <h1
            className="text-3xl font-bold text-foreground mt-8 mb-4 pb-2 border-b border-border"
            {...props}
          >
            {children}
          </h1>
        )
      },
      h2({ children, ...props }) {
        return (
          <h2
            className="text-2xl font-bold text-foreground mt-7 mb-3 pb-2 border-b border-border"
            {...props}
          >
            {children}
          </h2>
        )
      },
      h3({ children, ...props }) {
        return (
          <h3
            className="text-xl font-semibold text-foreground mt-6 mb-2"
            {...props}
          >
            {children}
          </h3>
        )
      },
      code({ className: codeClassName, children, ...props }: any) {
        const match = /language-(\w+)/.exec(codeClassName || '')
        const rawLanguage = match ? match[1] : ''
        const language = SUPPORTED_LANGUAGES.has(rawLanguage) ? rawLanguage : ''
        const codeString = String(children).replace(/\n$/, '')
        const isInline = !match && !codeString.includes('\n')

        if (!isInline && language) {
          return (
            <SyntaxHighlighter
              style={oneDark as any}
              language={language}
              PreTag="div"
              className="rounded-lg my-4 text-sm"
              customStyle={{
                margin: '1rem 0',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '0.875rem',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          )
        }

        if (!isInline && codeString.includes('\n')) {
          return (
            <SyntaxHighlighter
              style={oneDark as any}
              language="text"
              PreTag="div"
              className="rounded-lg my-4 text-sm"
              customStyle={{
                margin: '1rem 0',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '0.875rem',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          )
        }

        return (
          <code className="markdown-inline-code" {...props}>
            {children}
          </code>
        )
      },
      a({ children, ...props }) {
        return (
          <a
            className="markdown-link"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        )
      },
      table({ children }) {
        return (
          <div className="overflow-x-auto my-4">
            <table className="markdown-table">{children}</table>
          </div>
        )
      },
      thead({ children }) {
        return <thead className="markdown-thead">{children}</thead>
      },
      tbody({ children }) {
        return <tbody>{children}</tbody>
      },
      tr({ children }) {
        return <tr className="markdown-tr">{children}</tr>
      },
      th({ children }) {
        return <th className="markdown-th">{children}</th>
      },
      td({ children }) {
        return <td className="markdown-td">{children}</td>
      },
      ul({ children, ...props }) {
        return (
          <ul className="markdown-ul" {...props}>
            {children}
          </ul>
        )
      },
      ol({ children, ...props }) {
        return (
          <ol className="markdown-ol" {...props}>
            {children}
          </ol>
        )
      },
      li({ children, ...props }) {
        return (
          <li className="markdown-li" {...props}>
            {children}
          </li>
        )
      },
      blockquote({ children }) {
        return <blockquote className="markdown-blockquote">{children}</blockquote>
      },
      p({ children, ...props }) {
        return (
          <p className="markdown-p" {...props}>
            {children}
          </p>
        )
      },
      hr() {
        return <hr className="markdown-hr" />
      },
      img({ src, alt }) {
        return <img src={src} alt={alt} className="markdown-img" loading="lazy" />
      },
    }),
    []
  )

  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}
