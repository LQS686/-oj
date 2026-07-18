'use client'

import { useState } from 'react'
import { Brain, ChevronDown, ChevronUp } from 'lucide-react'

interface AiThinkingTraceProps {
  /** AI 思考过程文本（markdown 或纯文本） */
  thinking: string
  /** 是否默认展开（默认 false 折叠） */
  defaultExpanded?: boolean
  /** 折叠时最多显示的字符数（默认 800） */
  previewLength?: number
  /** 自定义 className */
  className?: string
}

/**
 * AI 思考过程展示组件（折叠式）
 *
 * 从 ai-generation/page.tsx 提取的"AI 思考过程"展示逻辑：
 * - 默认折叠为一个 chip/按钮（含 Brain 图标 + 标题）
 * - 展开后展示完整 thinking 文本（whitespace-pre-wrap，保留换行）
 * - 折叠态可显示截断的预览文本（previewLength 控制长度）
 *
 * 使用原生 details/summary 也可，但为与项目其他卡片交互一致，这里使用 useState + 按钮。
 */
export function AiThinkingTrace({
  thinking,
  defaultExpanded = false,
  previewLength = 800,
  className = '',
}: AiThinkingTraceProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (!thinking) return null

  const hasMore = thinking.length > previewLength
  const preview = hasMore ? thinking.slice(0, previewLength) + '...' : thinking

  return (
    <div className={`bg-muted rounded-lg p-3 ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Brain className="w-4 h-4" />
          AI 思考过程
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      {expanded && (
        <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
          {thinking}
        </p>
      )}
      {!expanded && hasMore && (
        <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed opacity-70">
          {preview}
        </p>
      )}
    </div>
  )
}

export default AiThinkingTrace
