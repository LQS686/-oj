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
  number?: number  // 洛谷风格的 #编号
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
  variant?: 'default' | 'compact'
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
  const progress = training.userProgress?.progressPercentage ?? 0
  const solved = training.userProgress?.solvedCount ?? 0
  const isJoined = training.userProgress?.isJoined ?? false
  const cat = training.categoryType ? CATEGORY_STYLE[training.categoryType] : null
  const CatIcon = cat?.icon

  return (
    <Link
      href={`/training/${training.id}`}
      className="card-static group block relative overflow-hidden hover:border-primary/50 hover:shadow-md transition-all p-4 pl-5"
    >
      {/* 左侧分类色条 */}
      {cat && <span className={`absolute left-0 top-0 bottom-0 w-1 ${cat.bar}`} />}

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 编号 + 推荐 + 分类徽标 */}
          <div className="flex items-center gap-1.5 mb-2">
            {training.number !== undefined && (
              <span className="text-xs font-mono text-muted-foreground">
                #{training.number}
              </span>
            )}
            {training.isRecommended && (
              <span className="text-warning inline-flex items-center" title="推荐">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
            {cat && CatIcon && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${cat.badge}`}>
                <CatIcon className="w-3 h-3" />
                {cat.label}
              </span>
            )}
            {variant === 'default' && training.tags && training.tags.length > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                {training.tags[0]}
              </span>
            )}
          </div>

          {/* 标题（更醒目） */}
          <h3 className="text-lg font-bold text-foreground group-hover:text-primary-light transition-colors line-clamp-1 mb-2">
            {training.title}
          </h3>

          {/* 作者 + 收藏 */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {training.author && (
              <span className="flex items-center gap-1">
                {training.author.avatar ? (
                  <img src={training.author.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <UserIcon className="w-3.5 h-3.5" />
                )}
                <span className="text-primary-light">{training.author.nickname || training.author.username}</span>
              </span>
            )}
            {typeof training.joinCount === 'number' && (
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5" />
                {formatCount(training.joinCount)}
              </span>
            )}
            <span className="text-muted-foreground/70">
              · {training.problemCount} 题
            </span>
          </div>
        </div>

        {/* 右侧进度环 */}
        <div className="flex-shrink-0">
          <ProgressCircle solved={solved} total={training.problemCount} size={56} />
        </div>
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
