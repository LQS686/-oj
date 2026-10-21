'use client'

import dynamic from 'next/dynamic'
import type { CodeLanguage } from '@/components/code-editor/CodeEditor'

/** CodeMirror 让首屏 JS 增加约 560KB，而详情页只是只读查看源码，统一懒加载 */
const CodeEditor = dynamic(() => import('@/components/code-editor/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full animate-pulse rounded-xl border border-border bg-muted"
      style={{ height: 'min(28rem, 60vh)' }}
    />
  ),
})

export function toCodeLanguage(lang?: string): CodeLanguage {
  return lang === 'c' || lang === 'python' ? lang : 'cpp'
}

export default function ReadOnlySubmissionCode({
  code,
  language,
  height = '480px',
}: {
  code: string
  language?: string
  height?: string
}) {
  return (
    <CodeEditor
      value={code}
      onChange={() => {}}
      language={toCodeLanguage(language)}
      readOnly
      height={height}
      className="hover:border-border focus-within:border-border focus-within:ring-0"
    />
  )
}
