'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * 题面里的纯文本数据块（如 ASCII 字符画、表格、原始数据）。
 * 用于渲染 ```plain / ```text 围栏，以及没有语言的代码块。
 *
 * 视觉上与题面里「样例输入/输出」完全一致：等宽 + bg-muted + rounded-xl + border
 * 同样支持一键复制，保持题面数据块与样例数据块的一致性。
 */
export default function SampleDataBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

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
    <div className="group relative my-4">
      <pre className="bg-muted p-4 rounded-xl border border-border text-sm font-mono whitespace-pre-wrap break-all text-foreground overflow-x-auto group-hover:border-primary/30 transition-colors duration-300">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 hover:bg-muted transition-colors duration-300 opacity-0 group-hover:opacity-100"
        aria-label="复制内容"
      >
        {copied ? (
          <Check className="w-4 h-4 text-secondary-light" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}