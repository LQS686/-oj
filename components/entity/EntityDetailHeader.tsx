'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'

export type EntityDetailTab = {
  key: string
  label: string
  icon: LucideIcon
  /** 路由型 Tab（竞赛）；与 onSelect 二选一 */
  href?: string
}

/**
 * 竞赛 / 题单 / 作业 顶栏信息卡：标题区 + 底栏 Tab
 * 领域特有内容通过 titleLeading / meta / actions / banner 注入
 */
export default function EntityDetailHeader({
  title,
  titleLeading,
  meta,
  actions,
  banner,
  tabs,
  activeKey,
  onSelect,
  layoutId,
}: {
  title: ReactNode
  titleLeading?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  banner?: ReactNode
  tabs: EntityDetailTab[]
  activeKey: string
  /** 按钮型 Tab（题单 / 作业） */
  onSelect?: (key: string) => void
  layoutId: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden mb-3 shadow-sm">
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {titleLeading}
          {typeof title === 'string' ? (
            <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>
          ) : (
            <div className="flex items-center gap-2 min-w-0">{title}</div>
          )}
        </div>
        {meta}
        {actions}
      </div>

      {banner}

      <div className="px-2 flex items-center gap-0.5 border-t border-border overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeKey === tab.key
          const className = `relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
            isActive
              ? 'text-primary-light'
              : 'text-muted-foreground hover:text-foreground'
          }`
          const content = (
            <>
              {isActive && (
                <motion.div
                  layoutId={layoutId}
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </>
          )

          if (tab.href) {
            return (
              <Link key={tab.key} href={tab.href} className={className}>
                {content}
              </Link>
            )
          }

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect?.(tab.key)}
              className={className}
            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}
