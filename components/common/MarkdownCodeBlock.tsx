'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism'

const LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  cxx: 'C++',
  cc: 'C++',
  python: 'Python',
  py: 'Python',
  python3: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  text: 'Text',
  plaintext: 'Text',
}

/** VS 浅色主题：去掉自带灰底，交给外壳控制 */
const CODE_THEME = {
  ...vs,
  'code[class*="language-"]': {
    ...vs['code[class*="language-"]'],
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.7',
    color: '#1f2328',
  },
  'pre[class*="language-"]': {
    ...vs['pre[class*="language-"]'],
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.7',
    margin: 0,
    padding: 0,
    border: 'none',
    boxShadow: 'none',
  },
}

function languageLabel(lang: string): string {
  const key = (lang || 'text').toLowerCase()
  return LANGUAGE_LABELS[key] || lang.toUpperCase() || 'Text'
}

function highlighterLanguage(lang: string): string {
  const key = (lang || 'text').toLowerCase()
  if (key === 'c++' || key === 'cxx' || key === 'cc') return 'cpp'
  if (key === 'py' || key === 'python3') return 'python'
  if (key === 'js') return 'javascript'
  if (key === 'ts') return 'typescript'
  return key || 'text'
}

export default function MarkdownCodeBlock({
  language,
  code,
}: {
  language: string
  code: string
}) {
  const [copied, setCopied] = useState(false)
  const label = languageLabel(language)
  const hlLang = highlighterLanguage(language)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div className="markdown-code-shell group">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-lang">{label}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="markdown-code-copy"
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <div className="markdown-code-body">
        <SyntaxHighlighter
          style={CODE_THEME}
          language={hlLang}
          PreTag="div"
          showLineNumbers={code.split('\n').length >= 8}
          lineNumberStyle={{
            minWidth: '2.25em',
            paddingRight: '1em',
            color: '#8b949e',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            padding: 0,
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: 1.7,
          }}
          codeTagProps={{
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              lineHeight: 1.7,
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
