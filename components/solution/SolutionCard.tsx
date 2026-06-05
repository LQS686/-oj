'use client'

import { Eye, ThumbsUp, Clock, Code2 } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

export interface SolutionListItem {
  id: string
  title: string
  author: {
    nickname: string
    avatar?: string
  }
  createdAt: string
  likes: number
  views: number
  codeLanguage: string
  isAiGenerated: boolean
  isOfficial: boolean
  isLiked?: boolean
}

interface SolutionCardProps {
  solution: SolutionListItem
  onClick?: () => void
}

const LANGUAGE_COLOR_MAP: Record<string, string> = {
  cpp: 'from-blue-500 to-indigo-500',
  c: 'from-slate-500 to-slate-700',
  java: 'from-orange-500 to-red-500',
  python: 'from-yellow-400 to-blue-500',
  javascript: 'from-yellow-300 to-amber-500',
  typescript: 'from-blue-400 to-blue-600',
  go: 'from-cyan-400 to-teal-500',
  rust: 'from-orange-600 to-amber-700',
}

function getLanguageGradient(language: string): string {
  const key = language?.toLowerCase() || ''
  return LANGUAGE_COLOR_MAP[key] || 'from-slate-400 to-slate-600'
}

function getAuthorInitial(nickname: string): string {
  if (!nickname) return '?'
  return nickname.charAt(0).toUpperCase()
}

export default function SolutionCard({ solution, onClick }: SolutionCardProps) {
  const {
    title,
    author,
    createdAt,
    likes,
    views,
    codeLanguage,
    isAiGenerated,
    isOfficial,
  } = solution

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="card group rounded-2xl p-5 cursor-pointer"
    >
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="avatar avatar-md">
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
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2 flex-wrap">
            {isAiGenerated && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md shadow-purple-500/30 flex-shrink-0">
                <span aria-hidden="true">🤖</span>
                <span>AI 生成</span>
              </span>
            )}
            <h3 className="text-base font-bold text-foreground line-clamp-2 group-hover:text-primary-light transition-colors flex-1 min-w-0">
              {title}
            </h3>
            {isOfficial && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 shadow-md shadow-amber-500/30 flex-shrink-0">
                <span aria-hidden="true">⭐</span>
                <span>标程</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3 flex-wrap">
            <span className="font-medium text-foreground/80">
              {author?.nickname || '匿名'}
            </span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatRelativeTime(createdAt)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gradient-to-r ${getLanguageGradient(
                codeLanguage
              )} shadow-sm`}
            >
              <Code2 className="w-3.5 h-3.5" />
              {codeLanguage || 'text'}
            </span>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ThumbsUp className="w-4 h-4" />
                <span className="font-medium">{likes}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span className="font-medium">{views}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
