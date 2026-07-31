'use client'

/**
 * components/training/SourceFilterCards.tsx
 * 题单 3 大来源分类卡片
 *
 * 视觉差异化：大图标容器 + 语义色系（官方 primary / 竞赛 accent / 收藏 secondary）
 */
import { BookOpen, Trophy, Bookmark, type LucideIcon } from 'lucide-react'

export type TrainingSource = 'all' | 'official' | 'contest' | 'mine'

interface SourceFilterCardsProps {
  active: TrainingSource
  onChange: (source: TrainingSource) => void
  /** 是否已登录（控制"我的收藏"卡片可用性） */
  isLoggedIn: boolean
}

interface SourceMeta {
  key: TrainingSource
  title: string
  desc1: string
  desc2: string
  icon: LucideIcon
  /** 主色：active 状态图标背景 */
  activeBg: string
  /** idle 状态图标容器底色 */
  idleBg: string
  /** 标题 active 文字色 */
  activeText: string
  /** hover 时图标容器底色（轻微着色） */
  hoverIconBg: string
}

const SOURCES: SourceMeta[] = [
  {
    key: 'official',
    title: '官方题单',
    desc1: '由平台官方发布',
    desc2: '系统学习路径',
    icon: BookOpen,
    activeBg: 'bg-primary',
    idleBg: 'bg-primary/10',
    hoverIconBg: 'group-hover:bg-primary/15',
    activeText: 'text-primary',
  },
  {
    key: 'contest',
    title: '竞赛/考级真题',
    desc1: '汇集各类真题',
    desc2: 'CSP/NOIP/ICPC 等',
    icon: Trophy,
    activeBg: 'bg-accent',
    idleBg: 'bg-accent/10',
    hoverIconBg: 'group-hover:bg-accent/15',
    activeText: 'text-accent',
  },
  {
    key: 'mine',
    title: '我的收藏',
    desc1: '我加入的题单',
    desc2: '点击题单右上角收藏',
    icon: Bookmark,
    activeBg: 'bg-secondary',
    idleBg: 'bg-secondary/10',
    hoverIconBg: 'group-hover:bg-secondary/15',
    activeText: 'text-secondary',
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
            className={`group relative overflow-hidden rounded-xl border text-left transition-all p-5 ${
              isActive
                ? 'border-transparent shadow-lg ring-1 ring-primary/30 bg-primary/10'
                : 'border-border bg-card hover:border-primary/40 hover:shadow-md'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* 激活时的左侧色条 */}
            {isActive && (
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.activeBg}`} />
            )}

            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive
                    ? `${s.activeBg} text-primary-foreground shadow-md`
                    : `${s.idleBg} ${s.hoverIconBg} text-muted-foreground`
                }`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-semibold text-base mb-1.5 ${
                    isActive ? s.activeText : 'text-foreground'
                  }`}
                >
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
