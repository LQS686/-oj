import MarkdownContent from './MarkdownContent'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <MarkdownContent
      content={content}
      className={className}
    />
  )
}
