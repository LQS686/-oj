'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
 Bold,
 Italic,
 Heading1,
 Heading2,
 Heading3,
 List,
 ListOrdered,
 Quote,
 Code,
 Code2,
 Sigma,
 Link as LinkIcon,
 Image as ImageIcon,
 Table as TableIcon,
 Eraser,
 type LucideIcon,
} from 'lucide-react'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'
import { cn } from '@/lib/utils'

export interface MarkdownEditorProps {
 value: string
 onChange: (v: string) => void
 placeholder?: string
 minHeight?: number
 maxLength?: number
 className?: string
 disabled?: boolean
}

type InsertMode = 'wrap' | 'line' | 'block'

interface ToolbarAction {
 icon: LucideIcon
 title: string
 run: (params: {
 selection: string
 lineStart: string
 hasSelection: boolean
 }) => { before: string; after?: string; placeholder?: string; mode: InsertMode }
}

const TABLE_TEMPLATE =
 '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n'

const TOOLBAR_GROUPS: ToolbarAction[][] = [
 [
 {
 icon: Heading1,
 title: '一级标题',
 run: () => ({ before: '# ', mode: 'line' }),
 },
 {
 icon: Heading2,
 title: '二级标题',
 run: () => ({ before: '## ', mode: 'line' }),
 },
 {
 icon: Heading3,
 title: '三级标题',
 run: () => ({ before: '### ', mode: 'line' }),
 },
 ],
 [
 {
 icon: Bold,
 title: '粗体',
 run: ({ selection, hasSelection }) => ({
 before: '**',
 after: '**',
 placeholder: '粗体文本',
 mode: 'wrap',
 // keep selection
 _selection: hasSelection ? selection : undefined,
 } as any),
 },
 {
 icon: Italic,
 title: '斜体',
 run: () => ({ before: '*', after: '*', placeholder: '斜体文本', mode: 'wrap' }),
 },
 {
 icon: Code,
 title: '行内代码',
 run: () => ({ before: '`', after: '`', placeholder: 'code', mode: 'wrap' }),
 },
 ],
 [
 {
 icon: List,
 title: '无序列表',
 run: () => ({ before: '- ', mode: 'line' }),
 },
 {
 icon: ListOrdered,
 title: '有序列表',
 run: () => ({ before: '1. ', mode: 'line' }),
 },
 {
 icon: Quote,
 title: '引用',
 run: () => ({ before: '> ', mode: 'line' }),
 },
 ],
 [
 {
 icon: Code2,
 title: '代码块',
 run: () => ({
 before: '```\n',
 after: '\n```',
 placeholder: 'code here',
 mode: 'block',
 }),
 },
 {
 icon: Sigma,
 title: '公式',
 run: () => ({ before: '$', after: '$', placeholder: 'x^2 + y^2 = z^2', mode: 'wrap' }),
 },
 ],
 [
 {
 icon: LinkIcon,
 title: '链接',
 run: () => ({ before: '[', after: '](url)', placeholder: '链接文本', mode: 'wrap' }),
 },
 {
 icon: ImageIcon,
 title: '图片',
 run: () => ({ before: '![', after: '](url)', placeholder: '图片描述', mode: 'wrap' }),
 },
 {
 icon: TableIcon,
 title: '表格',
 run: () => ({ before: TABLE_TEMPLATE, mode: 'block' }),
 },
 {
 icon: Eraser,
 title: '清除格式',
 run: () => ({ before: '', mode: 'block' }),
 },
 ],
]

function clearMarkdown(text: string): string {
 if (!text) return text
 return text
 // fenced code blocks
 .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
 .replace(/```/g, '')
 // inline code
 .replace(/`([^`\n]+)`/g, '$1')
 // math
 .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
 .replace(/\$([^$\n]+)\$/g, '$1')
 // images
 .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1')
 // links
 .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1')
 // headings
 .replace(/^\s{0,3}#{1,6}\s+/gm, '')
 // blockquote
 .replace(/^\s{0,3}>\s?/gm, '')
 // task list
 .replace(/^\s{0,3}[-*+]\s+\[[ xX]\]\s+/gm, '')
 // unordered list
 .replace(/^\s{0,3}[-*+]\s+/gm, '')
 // ordered list
 .replace(/^\s{0,3}\d+\.\s+/gm, '')
 // bold / italic
 .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
 .replace(/\*\*(.+?)\*\*/g, '$1')
 .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
 .replace(/__([^_\n]+)__/g, '$1')
 .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
 // table pipes
 .replace(/^\s*\|?\s*[-:|\s]+\|[-:|\s]+\s*$/gm, '')
 .replace(/\|/g, ' ')
 // hr
 .replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*$/gm, (m) => m.replace(/[-*_]/g, ''))
 .replace(/^\s*([-*_]{3,})\s*$/gm, '')
}

function countWords(text: string): number {
 if (!text) return 0
 const trimmed = text.trim()
 if (!trimmed) return 0
 // count CJK characters as individual "words"
 const cjkMatches = trimmed.match(/[\u3400-\u9fff\uf900-\ufaff]/g)
 const cjkCount = cjkMatches ? cjkMatches.length : 0
 // count latin words via non-letter/digit runs
 const stripped = trimmed.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ')
 const latinWords = stripped
 .split(/[^A-Za-z0-9_]+/)
 .filter((w) => w.length > 0)
 return cjkCount + latinWords.length
}

export default function MarkdownEditor({
 value,
 onChange,
 placeholder = '在此输入 Markdown 内容…',
 minHeight = 360,
 maxLength = 50000,
 className,
 disabled = false,
}: MarkdownEditorProps) {
 const textareaRef = useRef<HTMLTextAreaElement | null>(null)
 const [debouncedValue, setDebouncedValue] = useState(value)

 // Debounce preview updates (300ms)
 useEffect(() => {
 const timer = window.setTimeout(() => {
 setDebouncedValue(value)
 }, 300)
 return () => window.clearTimeout(timer)
 }, [value])

 // Keep preview in sync if value changes externally
 useEffect(() => {
 setDebouncedValue(value)
 }, [value])

 const charCount = value.length
 const overLimit = charCount > maxLength
 const wordCount = useMemo(() => countWords(value), [value])

 const submitHint = useMemo(() => {
 if (overLimit) return { tone: 'error' as const, text: '已超出字数上限' }
 if (charCount === 0) return { tone: 'muted' as const, text: '尚未输入内容' }
 if (charCount < 50) return { tone: 'muted' as const, text: '内容过短，建议补充说明' }
 return { tone: 'success' as const, text: '可以提交' }
 }, [charCount, overLimit])

 const focusAndSelect = useCallback((start: number, end: number) => {
 const textarea = textareaRef.current
 if (!textarea) return
 textarea.focus()
 // schedule after value is rendered
 window.setTimeout(() => {
 textarea.focus()
 textarea.setSelectionRange(start, end)
 }, 0)
 }, [])

 const applyEdit = useCallback(
 (next: string, selectionStart: number, selectionEnd: number) => {
 if (disabled) return
 // Hard-cap at maxLength to avoid runaway
 if (next.length > maxLength) {
 next = next.slice(0, maxLength)
 }
 onChange(next)
 focusAndSelect(selectionStart, selectionEnd)
 },
 [disabled, maxLength, onChange, focusAndSelect]
 )

 const insertWrap = useCallback(
 (before: string, after: string, placeholderText?: string) => {
 const textarea = textareaRef.current
 if (!textarea) return
 const start = textarea.selectionStart
 const end = textarea.selectionEnd
 const text = textarea.value
 const selected = text.slice(start, end)
 const hasSelection = selected.length > 0
 const inner = hasSelection ? selected : placeholderText ?? 'text'
 const next = text.slice(0, start) + before + inner + after + text.slice(end)
 const cursorStart = start + before.length
 const cursorEnd = cursorStart + inner.length
 applyEdit(next, cursorStart, cursorEnd)
 },
 [applyEdit]
 )

 const insertAtLineStart = useCallback(
 (prefix: string) => {
 const textarea = textareaRef.current
 if (!textarea) return
 const start = textarea.selectionStart
 const text = textarea.value
 const lineStart = text.lastIndexOf('\n', start - 1) + 1
 // avoid double prefixing
 const beforeLine = text.slice(lineStart, start)
 const isAlreadyPrefixed = /^\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/.test(beforeLine)
 const prefixToInsert = isAlreadyPrefixed ? '' : prefix
 if (!prefixToInsert) {
 focusAndSelect(start, start)
 return
 }
 const next = text.slice(0, lineStart) + prefixToInsert + text.slice(lineStart)
 const newPos = start + prefixToInsert.length
 applyEdit(next, newPos, newPos)
 },
 [applyEdit, focusAndSelect]
 )

 const insertBlock = useCallback(
 (block: string) => {
 const textarea = textareaRef.current
 if (!textarea) return
 const start = textarea.selectionStart
 const end = textarea.selectionEnd
 const text = textarea.value
 // ensure we start on a new line
 const needsLeading = start > 0 && text[start - 1] !== '\n'
 const prefix = needsLeading ? '\n' : ''
 const needsTrailing = end < text.length && text[end] !== '\n'
 const suffix = needsTrailing ? '\n' : ''
 const insert = `${prefix}${block}${suffix}`
 const next = text.slice(0, start) + insert + text.slice(end)
 const cursorPos = start + insert.length
 applyEdit(next, cursorPos, cursorPos)
 },
 [applyEdit]
 )

 const runAction = useCallback(
 (action: ToolbarAction) => {
 const textarea = textareaRef.current
 if (!textarea) return
 const start = textarea.selectionStart
 const end = textarea.selectionEnd
 const text = textarea.value
 const selection = text.slice(start, end)
 const lineStart = text.lastIndexOf('\n', start - 1) + 1
 const hasSelection = selection.length > 0

 // Special handling: clear format operates on selection (or whole doc)
 if (action.title === '清除格式') {
 if (hasSelection) {
 const cleaned = clearMarkdown(selection)
 const next = text.slice(0, start) + cleaned + text.slice(end)
 const cursorEnd = start + cleaned.length
 applyEdit(next, start, cursorEnd)
 } else {
 const cleaned = clearMarkdown(text)
 applyEdit(cleaned, 0, cleaned.length)
 }
 return
 }

 const result = action.run({ selection, lineStart: text.slice(0, lineStart), hasSelection })
 if (result.mode === 'line') {
 insertAtLineStart(result.before)
 } else if (result.mode === 'block') {
 insertBlock(result.before)
 } else {
 insertWrap(result.before, result.after ?? '', result.placeholder)
 }
 },
 [applyEdit, insertAtLineStart, insertBlock, insertWrap]
 )

 const handleKeyDown = useCallback(
 (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
 if (e.ctrlKey || e.metaKey) {
 switch (e.key.toLowerCase()) {
 case 'b':
 e.preventDefault()
 insertWrap('**', '**', '粗体文本')
 return
 case 'i':
 e.preventDefault()
 insertWrap('*', '*', '斜体文本')
 return
 case 'k':
 e.preventDefault()
 insertWrap('[', '](url)', '链接文本')
 return
 }
 }

 if (e.key === 'Tab' && !e.shiftKey) {
 e.preventDefault()
 insertWrap(' ', '', '')
 }
 },
 [insertWrap]
 )

 return (
 <div
 className={cn(
 'rounded-lg border border-border bg-card text-card-foreground overflow-hidden flex flex-col',
 disabled && 'opacity-60',
 className
 )}
 >
 {/* Toolbar */}
 <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-border bg-background-secondary/60">
 {TOOLBAR_GROUPS.map((group, gi) => (
 <div key={gi} className="flex items-center gap-0.5">
 {group.map((action) => {
 const Icon = action.icon
 return (
 <button
 key={action.title}
 type="button"
 onClick={() => runAction(action)}
 disabled={disabled}
 title={action.title}
 aria-label={action.title}
 className={cn(
 'inline-flex items-center justify-center h-8 w-8 rounded-md',
 'text-muted-foreground hover:text-foreground hover:bg-muted',
 'transition-colors duration-150',
 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
 'disabled:cursor-not-allowed disabled:opacity-50'
 )}
 >
 <Icon className="w-4 h-4" />
 </button>
 )
 })}
 {gi < TOOLBAR_GROUPS.length - 1 && (
 <span
 aria-hidden="true"
 className="mx-1 h-5 w-px bg-border"
 />
 )}
 </div>
 ))}
 </div>

 {/* Editor + Preview */}
 <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
 <div className="relative">
 <textarea
 ref={textareaRef}
 value={value}
 onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
 onKeyDown={handleKeyDown}
 disabled={disabled}
 placeholder={placeholder}
 spellCheck={false}
 className={cn(
 'w-full resize-none bg-transparent p-4',
 'font-mono text-sm leading-6',
 'text-foreground placeholder:text-muted-foreground',
 'focus:outline-none',
 'custom-scrollbar'
 )}
 style={{ minHeight }}
 />
 </div>
 <div
 className="bg-background-secondary/40 p-4 overflow-y-auto custom-scrollbar"
 style={{ minHeight }}
 >
 {debouncedValue.trim() ? (
 <MarkdownRenderer content={debouncedValue} preprocessContent={false} />
 ) : (
 <p className="text-sm text-muted-foreground italic">实时预览将显示在这里…</p>
 )}
 </div>
 </div>

 {/* Status bar */}
 <div
 className={cn(
 'flex flex-wrap items-center justify-between gap-2 px-3 py-1.5',
 'border-t border-border bg-background-secondary/60',
 'text-xs text-muted-foreground'
 )}
 >
 <div className="flex items-center gap-3">
 <span>
 字符{' '}
 <span className={cn('font-medium', overLimit ? 'text-error' : 'text-foreground')}>
 {charCount.toLocaleString()}
 </span>
 {' / '}
 {maxLength.toLocaleString()}
 </span>
 <span className="hidden sm:inline-block h-3 w-px bg-border" />
 <span>
 字数 <span className="font-medium text-foreground">{wordCount.toLocaleString()}</span>
 </span>
 </div>
 <div className="flex items-center gap-2">
 <span
 className={cn(
 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border',
 submitHint.tone === 'success' &&
 'border-secondary/40 text-secondary bg-secondary/10',
 submitHint.tone === 'muted' && 'border-border text-muted-foreground bg-muted',
 submitHint.tone === 'error' && 'border-error/40 text-error bg-error/10'
 )}
 >
 <span
 aria-hidden="true"
 className={cn(
 'inline-block w-1.5 h-1.5 rounded-full',
 submitHint.tone === 'success' && 'bg-secondary',
 submitHint.tone === 'muted' && 'bg-muted-foreground',
 submitHint.tone === 'error' && 'bg-error'
 )}
 />
 {submitHint.text}
 </span>
 </div>
 </div>
 </div>
 )
}
