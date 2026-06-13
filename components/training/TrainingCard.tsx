'use client'

/**
 * components/training/TrainingCard.tsx
 * 题单卡片（洛谷风格：编号+标题+作者+收藏+进度环）
 */
import Link from 'next/link'
import { User as UserIcon, Heart, Sparkles } from 'lucide-react'
import { ProgressCircle } from './ProgressCircle'

export interface TrainingCardData {
  id: string
  number?: number  // 洛谷风格的 #编号
  title: string
  description?: string
  difficulty?: string | null
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

export function TrainingCard({ training, variant = 'default' }: TrainingCardProps) {
  const progress = training.userProgress?.progressPercentage ?? 0
  const solved = training.userProgress?.solvedCount ?? 0
  const isJoined = training.userProgress?.isJoined ?? false

  return (
    <Link
      href={`/training/${training.id}`}
      className="card p-5 group block hover:border-primary/50 transition-colors relative"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {/* 编号 + 标题 */}
          <div className="flex items-center gap-2 mb-1.5">
            {training.number !== undefined && (
              <span className="text-xs font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                #{training.number}
              </span>
            )}
            {training.isRecommended && (
              <span className="text-warning inline-flex items-center gap-0.5">
                <Sparkles className="w-3 h-3" />
              </span>
            )}
            {variant === 'default' && training.tags && training.tags.length > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                {training.tags[0]}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-foreground group-hover:text-primary-light transition-colors line-clamp-1 mb-2">
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
function formatCount(n: number): string {
  if (n >= 10000) {
    return (n / 1000).toFixed(1) + 'k'
  }
  return n.toString()
}

export default TrainingCard
