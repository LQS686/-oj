'use client'

/**
 * components/training/SourceFilterCards.tsx
 * 题单 3 大来源分类卡片
 *
 * 视觉差异化：渐变背景 + 大图标容器 + 主题色系（官方蓝/竞赛金/我的绿）
 */
import { BookOpen, Trophy, UserCheck, type LucideIcon } from 'lucide-react'

export type TrainingSource = 'all' | 'official' | 'contest' | 'mine'

interface SourceFilterCardsProps {
  active: TrainingSource
  onChange: (source: TrainingSource) => void
  /** 是否已登录（控制"我的"卡片可用性） */
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
    activeBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    idleBg: 'bg-blue-50 dark:bg-blue-950/40',
    hoverIconBg: 'group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50',
    activeText: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'contest',
    title: '竞赛/考级真题',
    desc1: '汇集各类真题',
    desc2: 'CSP/NOIP/ICPC 等',
    icon: Trophy,
    activeBg: 'bg-gradient-to-br from-amber-500 to-orange-500',
    idleBg: 'bg-amber-50 dark:bg-amber-950/40',
    hoverIconBg: 'group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50',
    activeText: 'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'mine',
    title: '我的题单',
    desc1: '我加入的题单',
    desc2: '也可创建自己的题单',
    icon: UserCheck,
    activeBg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    idleBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    hoverIconBg: 'group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50',
    activeText: 'text-emerald-600 dark:text-emerald-400',
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
                ? 'border-transparent shadow-lg ring-1 ring-primary/30 bg-gradient-to-br from-primary/5 to-primary/10'
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
                    ? `${s.activeBg} text-white shadow-md`
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
