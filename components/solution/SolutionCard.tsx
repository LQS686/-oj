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
 className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5 transition-colors group cursor-pointer"
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
 {isAiGenerated && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-purple-700 text-white flex-shrink-0">
 <span aria-hidden="true">🤖</span>
 <span>AI</span>
 </span>
 )}
 <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary-light transition-colors flex-1 min-w-0">
 {title}
 </h3>
 {isOfficial && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 flex-shrink-0">
 <span aria-hidden="true">⭐</span>
 <span>标程</span>
 </span>
 )}
 <span
 className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white bg-gradient-to-r ${getLanguageGradient(
 codeLanguage
 )} flex-shrink-0`}
 >
 <Code2 className="w-3 h-3" />
 {codeLanguage || 'text'}
 </span>
 </div>

 {/* 点赞/浏览列 */}
 <div className="col-span-2 flex items-center gap-3 text-sm text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <ThumbsUp className="w-3.5 h-3.5" />
 <span className="font-medium">{likes}</span>
 </span>
 <span className="inline-flex items-center gap-1">
 <Eye className="w-3.5 h-3.5" />
 <span className="font-medium">{views}</span>
 </span>
 </div>

 {/* 时间列 */}
 <div className="col-span-2 flex items-center gap-1 text-xs text-muted-foreground">
 <Clock className="w-3.5 h-3.5 flex-shrink-0" />
 <span className="truncate">{formatRelativeTime(createdAt)}</span>
 </div>
 </div>
 )
}
