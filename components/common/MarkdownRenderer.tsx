import MarkdownContent from './MarkdownContent'

interface MarkdownRendererProps {
  content: string
  className?: string
  /** 是否启用预处理（数学公式上标增强等）。笔记场景建议 true，题解场景建议 false */
  preprocessContent?: boolean
}

export default function MarkdownRenderer({
  content,
  className,
  preprocessContent = true,
}: MarkdownRendererProps) {
  return (
    <MarkdownContent
      content={content}
      className={className}
      preprocessContent={preprocessContent}
    />
  )
}
