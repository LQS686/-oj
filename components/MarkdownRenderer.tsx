import React from 'react'
import MarkdownContent from './common/MarkdownContent'

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <MarkdownContent 
      content={content} 
      preprocessContent={true}
    />
  )
}
