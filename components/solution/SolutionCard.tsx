'use client'

import type { ReactNode } from 'react'
import { Eye, Clock, Code2, ChevronDown } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

export interface SolutionListItem {
  id: string
  title: string
  author: {
    nickname: string
    avatar?: string
  }
  createdAt: string
  views: number
  codeLanguage: string
  isOfficial: boolean
}

interface SolutionCardProps {
  solution: SolutionListItem
  onClick?: () => void
  /** 行内展开模式（显示折叠箭头；列表跳转页不传） */
  expandable?: boolean
  /** 是否展开（题解 Tab 行内阅读） */
  expanded?: boolean
  /** 展开区内容 */
  children?: ReactNode
}

const LANGUAGE_COLOR_MAP: Record<string, string> = {
  cpp: 'bg-blue-500',
  c: 'bg-slate-600',
  java: 'bg-orange-500',
  python: 'bg-blue-600',
  javascript: 'bg-amber-500',
  typescript: 'bg-blue-500',
  go: 'bg-cyan-500',
  rust: 'bg-orange-700',
}

function getLanguageClass(language: string): string {
  const key = language?.toLowerCase() || ''
  return LANGUAGE_COLOR_MAP[key] || 'bg-slate-500'
}

function getAuthorInitial(nickname: string): string {
  if (!nickname) return '?'
  return nickname.charAt(0).toUpperCase()
}

export default function SolutionCard({
  solution,
  onClick,
  expandable = false,
  expanded = false,
  children,
}: SolutionCardProps) {
  const { title, author, createdAt, views, codeLanguage, isOfficial } = solution

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div className={cn('border-b border-border last:border-b-0', expanded && 'bg-primary/[0.02]')}>
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-expanded={expandable ? expanded : undefined}
        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-primary/5 transition-colors group cursor-pointer"
      >
        {/* 作者列：头像 + 昵称 */}
        <div className="col-span-3 flex items-center gap-2 min-w-0">
          <div className="avatar avatar-md flex-shrink-0">
            {author?.avatar ? (
              <img
                src={author.avatar}
                alt={author.nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="avatar-fallback text-sm">
                {getAuthorInitial(author?.nickname)}
              </div>
            )}
          </div>
          <span className="font-medium text-foreground/80 text-sm truncate">
            {author?.nickname || '匿名'}
          </span>
        </div>

        {/* 标题/摘要列：徽标 + 标题 + 语言 */}
        <div className="col-span-5 flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary-light transition-colors flex-1 min-w-0">
            {title}
          </h3>
          {isOfficial && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-primary-foreground flex-shrink-0">
              <span aria-hidden="true">⭐</span>
              <span>标程</span>
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-primary-foreground ${getLanguageClass(
              codeLanguage
            )} flex-shrink-0`}
          >
            <Code2 className="w-3 h-3" />
            {codeLanguage || 'text'}
          </span>
        </div>

        {/* 浏览列 */}
        <div className="col-span-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            <span className="font-medium">{views}</span>
          </span>
        </div>

        {/* 时间 + 展开指示 */}
        <div className="col-span-2 flex items-center justify-between gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 min-w-0">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{formatRelativeTime(createdAt)}</span>
          </span>
          {expandable && (
            <ChevronDown
              className={cn(
                'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
                expanded && 'rotate-180 text-primary'
              )}
              aria-hidden
            />
          )}
        </div>
      </div>

      {expandable && expanded && children && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 bg-background/60">
          {children}
        </div>
      )}
    </div>
  )
}
