'use client'

/**
 * components/training/TrainingCard.tsx
 * 题单卡片（洛谷风格：编号+标题+作者+收藏+进度环）
 *
 * 视觉差异化：左侧分类色条 + 大标题 + 简洁内容区
 */
import Link from 'next/link'
import { User as UserIcon, Heart, Sparkles, BookOpen, Trophy } from 'lucide-react'
import { ProgressCircle } from './ProgressCircle'

export interface TrainingCardData {
 id: string
 number?: number // 洛谷风格的 #编号
 title: string
 description?: string
 difficulty?: string | null
 categoryType?: 'official' | 'contest' | null
 isRecommended?: boolean
 tags?: string[]
 cover?: string | null
 problemCount: number
 joinCount?: number
 viewCount?: number
 category?: { id: string; name: string } | null
 author?: { id: string; username: string; nickname?: string | null; avatar?: string | null } | null
 userProgress?: {
 solvedCount: number
 attemptedCount: number
 progressPercentage: number
 isJoined: boolean
 }
}

interface TrainingCardProps {
 training: TrainingCardData
 variant?: 'default' | 'compact' | 'grid'
}

/** 分类对应的色条/徽标 */
const CATEGORY_STYLE: Record<string, { bar: string; badge: string; icon: typeof BookOpen; label: string }> = {
 official: {
 bar: 'bg-gradient-to-b from-blue-500 to-blue-600',
 badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
 icon: BookOpen,
 label: '官方',
 },
 contest: {
 bar: 'bg-gradient-to-b from-amber-500 to-orange-500',
 badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
 icon: Trophy,
 label: '竞赛',
 },
}

export function TrainingCard({ training, variant = 'default' }: TrainingCardProps) {
 const solved = training.userProgress?.solvedCount ?? 0
 const cat = training.categoryType ? CATEGORY_STYLE[training.categoryType] : null
 const CatIcon = cat?.icon

 if (variant === 'grid') {
 return (
 <Link
 href={`/training/${training.id}`}
 className="card-static rounded-xl p-5 block hover:border-primary/30 transition-colors h-full group"
 >
 <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
 {cat && CatIcon ? (
 <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${cat.badge}`}>
 <CatIcon className="w-3 h-3" />
 {cat.label}
 </span>
 ) : (
 <span className="w-3.5" />
 )}
 {training.number !== undefined && (
 <span className="text-xs font-mono text-muted-foreground">#{training.number}</span>
 )}
 </div>
 <div className="flex items-start gap-1 mb-1.5">
 {training.isRecommended && (
 <Sparkles className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" title="推荐" />
 )}
 <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary-light transition-colors">
 {training.title}
 </h3>
 </div>
 {training.author && (
 <p className="text-xs text-muted-foreground truncate mb-3">
 {training.author.nickname || training.author.username}
 </p>
 )}
 <div className="flex items-center justify-between gap-2">
 <ProgressCircle solved={solved} total={training.problemCount} size={40} />
 <div className="text-right text-xs text-muted-foreground">
 {typeof training.joinCount === 'number' && (
 <span className="flex items-center justify-end gap-1 mb-0.5">
 <Heart className="w-3 h-3" />
 {formatCount(training.joinCount)}
 </span>
 )}
 <span>{training.problemCount} 题</span>
 </div>
 </div>
 </Link>
 )
 }

 return (
 <Link
 href={`/training/${training.id}`}
 className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5 transition-colors group"
 >
 {/* 标题列：编号 + 推荐 + 分类徽标 + 标题 + 标签 */}
 <div className="col-span-5 flex items-center gap-2 min-w-0">
 {training.number !== undefined && (
 <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
 #{training.number}
 </span>
 )}
 {training.isRecommended && (
 <span className="text-warning inline-flex items-center flex-shrink-0" title="推荐">
 <Sparkles className="w-3.5 h-3.5" />
 </span>
 )}
 {cat && CatIcon && (
 <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${cat.badge} flex-shrink-0`}>
 <CatIcon className="w-3 h-3" />
 {cat.label}
 </span>
 )}
 <h3 className="text-sm font-semibold text-foreground group-hover:text-primary-light transition-colors truncate">
 {training.title}
 </h3>
 {variant === 'default' && training.tags && training.tags.length > 0 && (
 <span className="text-xs text-muted-foreground truncate hidden sm:inline">
 {training.tags[0]}
 </span>
 )}
 </div>

 {/* 作者列 */}
 <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
 {training.author && (
 <>
 {training.author.avatar ? (
 <img src={training.author.avatar} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
 ) : (
 <UserIcon className="w-3.5 h-3.5 flex-shrink-0" />
 )}
 <span className="text-primary-light truncate">{training.author.nickname || training.author.username}</span>
 </>
 )}
 </div>

 {/* 进度环列 */}
 <div className="col-span-3 flex items-center justify-center">
 <ProgressCircle solved={solved} total={training.problemCount} size={48} />
 </div>

 {/* 统计列 */}
 <div className="col-span-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
 {typeof training.joinCount === 'number' && (
 <span className="flex items-center gap-1">
 <Heart className="w-3.5 h-3.5" />
 {formatCount(training.joinCount)}
 </span>
 )}
 <span className="text-muted-foreground/70">
 {training.problemCount} 题
 </span>
 </div>
 </Link>
 )
}

/** 数字格式化：36135 -> 36.13k */
function formatCount(n: number): number | string {
 if (n >= 10000) {
 return (n / 1000).toFixed(1) + 'k'
 }
 return n.toString()
}

export default TrainingCard
