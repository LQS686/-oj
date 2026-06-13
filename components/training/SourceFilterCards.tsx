'use client'

/**
 * components/training/SourceFilterCards.tsx
 * 题单 3 大来源分类卡片
 *
 * - 官方题单：isRecommended=true（管理员精选）
 * - 竞赛/考级真题：标签/分类含"竞赛"/"考级"/"真题"等关键词
 * - 我的题单：当前用户已加入或自己创建的
 */
import { BookOpen, Trophy, UserCheck } from 'lucide-react'

export type TrainingSource = 'all' | 'official' | 'contest' | 'mine'

interface SourceFilterCardsProps {
  active: TrainingSource
  onChange: (source: TrainingSource) => void
  /** 是否已登录（控制"我的"卡片可用性） */
  isLoggedIn: boolean
}

const SOURCES: Array<{
  key: TrainingSource
  title: string
  desc1: string
  desc2: string
  icon: typeof BookOpen
}> = [
  {
    key: 'official',
    title: '官方题单',
    desc1: '由平台官方发布',
    desc2: '系统学习路径',
    icon: BookOpen,
  },
  {
    key: 'contest',
    title: '竞赛/考级真题',
    desc1: '汇集各类真题',
    desc2: 'CSP/NOIP/ICPC 等',
    icon: Trophy,
  },
  {
    key: 'mine',
    title: '我的题单',
    desc1: '我加入的题单',
    desc2: '也可创建自己的题单',
    icon: UserCheck,
  },
]

export function SourceFilterCards({ active, onChange, isLoggedIn }: SourceFilterCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {SOURCES.map(s => {
        const Icon = s.icon
        const isActive = active === s.key
        const disabled = s.key === 'mine' && !isLoggedIn
        return (
          <button
            key={s.key}
            onClick={() => !disabled && onChange(s.key)}
            disabled={disabled}
            className={`card-static p-5 text-left transition-all ${
              isActive
                ? 'border-primary shadow-md shadow-primary/20 bg-primary/5'
                : 'hover:border-primary/40'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isActive ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-muted/40 text-muted-foreground'
              }`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-base mb-1.5 ${isActive ? 'text-primary-light' : 'text-foreground'}`}>
                  {s.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-1">{s.desc1}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{s.desc2}</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default SourceFilterCards
