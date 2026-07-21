import MarkdownContent from './MarkdownContent'

interface MarkdownRendererProps {
  content: string
  className?: string
  /**
   * 是否启用预处理（数学公式上标增强）。
   *
   * 已废弃：原预处理逻辑会破坏 KaTeX 块级公式 `$$...$$`，现已移除。
   * 保留参数仅为向后兼容，实际不做任何处理。
   */
  preprocessContent?: boolean
}

export default function MarkdownRenderer({
  content,
  className,
  preprocessContent = false,
}: MarkdownRendererProps) {
  return (
    <MarkdownContent
      content={content}
      className={className}
      preprocessContent={preprocessContent}
    />
  )
}
