'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * 通用复制按钮（client）：题面代码块 / 数据块 / 样例输入输出共用。
 * 未复制显示 Copy 图标（继承按钮 color），已复制显示 Check 图标（secondary 色）。
 * showLabel 时额外显示「复制 / 已复制」文字（代码块工具栏用）。
 */
export default function CopyButton({
  code,
  className = '',
  iconClassName = 'w-4 h-4',
  showLabel = false,
}: {
  code: string
  className?: string
  iconClassName?: string
  showLabel?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // 剪贴板不可用（如非安全上下文）时静默忽略
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={className}
      aria-label="复制"
    >
      {copied ? (
        <>
          <Check className={`${iconClassName} text-secondary-light`} />
          {showLabel && <span>已复制</span>}
        </>
      ) : (
        <>
          <Copy className={iconClassName} />
          {showLabel && <span>复制</span>}
        </>
      )}
    </button>
  )
}
