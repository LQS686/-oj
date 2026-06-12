'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import MarkdownContent from './MarkdownContent'
import { 
  Bold, Italic, List, ListOrdered, Code, FileCode, Link as LinkIcon, Image as ImageIcon, 
  Eye, Edit3, Heading1, Heading2, Heading3, Quote, Minus, Table, CheckSquare,
  X, Maximize2, Minimize2
} from 'lucide-react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  placeholder?: string
}

export default function MarkdownEditor({ 
  value, 
  onChange, 
  height = '400px',
  placeholder = '在此输入 Markdown 内容...'
}: MarkdownEditorProps) {
  const [isPreview, setIsPreview] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    return () => {
      setIsFullscreen(false)
    }
  }, [])

  const insertText = useCallback((before: string, after: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selection = text.substring(start, end)

    const newText = text.substring(0, start) + before + selection + after + text.substring(end)
    onChange(newText)
    
    setTimeout(() => {
      textarea.focus()
      const newPos = start + before.length + selection.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }, [onChange])

  const insertLineStart = useCallback((prefix: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const text = textarea.value
    
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart)
    onChange(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    }, 0)
  }, [onChange])

  const toolbarGroups = [
    [
      { icon: Heading1, title: '标题1', action: () => insertLineStart('# ') },
      { icon: Heading2, title: '标题2', action: () => insertLineStart('## ') },
      { icon: Heading3, title: '标题3', action: () => insertLineStart('### ') },
    ],
    [
      { icon: Bold, title: '粗体 (Ctrl+B)', action: () => insertText('**', '**') },
      { icon: Italic, title: '斜体 (Ctrl+I)', action: () => insertText('*', '*') },
      { icon: CheckSquare, title: '任务列表', action: () => insertLineStart('- [ ] ') },
    ],
    [
      { icon: List, title: '无序列表', action: () => insertLineStart('- ') },
      { icon: ListOrdered, title: '有序列表', action: () => insertLineStart('1. ') },
      { icon: Quote, title: '引用', action: () => insertLineStart('> ') },
    ],
    [
      { icon: Code, title: '行内代码', action: () => insertText('`', '`') },
      { icon: FileCode, title: '代码块', action: () => insertText('```\n', '\n```') },
      { icon: Minus, title: '分割线', action: () => insertText('\n---\n') },
    ],
    [
      { icon: LinkIcon, title: '链接', action: () => insertText('[', '](url)') },
      { icon: ImageIcon, title: '图片', action: () => insertText('![', '](url)') },
      { icon: Table, title: '表格', action: () => insertText('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n') },
    ],
  ]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          insertText('**', '**')
          break
        case 'i':
          e.preventDefault()
          insertText('*', '*')
          break
        case 'k':
          e.preventDefault()
          insertText('[', '](url)')
          break
      }
    }
    
    if (e.key === 'Tab') {
      e.preventDefault()
      insertText('  ')
    }
  }

  const editorHeight = isFullscreen ? 'calc(100vh - 120px)' : height

  return (
    <div className={`rounded-xl overflow-hidden flex flex-col border transition-all duration-300 ${
      isFullscreen 
        ? 'fixed inset-4 z-50 bg-slate-900 border-primary/30' 
        : 'bg-slate-800/50 border-white/10'
    }`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-slate-800/80">
        <div className="flex items-center gap-1 flex-wrap">
          {toolbarGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex items-center gap-1">
              {group.map((item, itemIndex) => (
                <button
                  key={itemIndex}
                  onClick={item.action}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  title={item.title}
                  type="button"
                >
                  <item.icon className="w-4 h-4" />
                </button>
              ))}
              {groupIndex < toolbarGroups.length - 1 && (
                <div className="w-px h-5 bg-white/10 mx-1" />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏编辑'}
            type="button"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsPreview(!isPreview)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isPreview 
                ? 'bg-primary/20 text-primary-light' 
                : 'hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
            type="button"
          >
            {isPreview ? (
              <>
                <Edit3 className="w-4 h-4" /> 编辑
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> 预览
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden" style={{ height: editorHeight }}>
        {isPreview ? (
          <div className="h-full overflow-y-auto p-6 prose prose-invert prose-slate max-w-none prose-headings:text-white prose-p:text-slate-300 prose-a:text-primary-light prose-code:text-pink-400 prose-pre:bg-slate-900">
            <MarkdownContent 
              content={value || '*暂无内容*'}
              preprocessContent={false}
            />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full p-4 resize-none focus:outline-none font-mono text-sm bg-transparent text-slate-200 placeholder-slate-500"
            placeholder={placeholder}
          />
        )}
      </div>
      
      {isFullscreen && (
        <div className="absolute top-2 right-2 z-50">
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}
