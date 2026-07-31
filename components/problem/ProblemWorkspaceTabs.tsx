'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  Code as CodeIcon,
  FileText,
  History,
  ListChecks,
  MessageSquare,
} from 'lucide-react'
import { motion } from 'framer-motion'

/** 做题工作区桌面 Tab（不含移动端专属 code） */
export type WorkspaceDesktopTab = 'description' | 'solutions' | 'submissions' | 'stats'

/** 做题工作区全部 Tab，含移动端代码视图 */
export type WorkspaceTab = WorkspaceDesktopTab | 'code'

export type WorkspacePresetId = 'library' | 'contest' | 'training' | 'assignment'

export interface WorkspacePreset {
  id: WorkspacePresetId
  /** 桌面左侧 Tab（不含 code） */
  desktopTabs: WorkspaceDesktopTab[]
  /** 底部移动端 Tab */
  mobileTabs: WorkspaceTab[]
  dense: boolean
  hideDifficultyAndTags: boolean
  hideDescriptionTags: boolean
}

/**
 * 各入口能力预设：竞赛故意不含题解/统计，作业不含题解。
 */
export const WORKSPACE_PRESETS: Record<WorkspacePresetId, WorkspacePreset> = {
  library: {
    id: 'library',
    desktopTabs: ['description', 'solutions', 'submissions', 'stats'],
    mobileTabs: ['description', 'code', 'submissions', 'stats'],
    dense: false,
    hideDifficultyAndTags: false,
    hideDescriptionTags: false,
  },
  contest: {
    id: 'contest',
    desktopTabs: ['description', 'submissions'],
    mobileTabs: ['description', 'code', 'submissions'],
    dense: true,
    hideDifficultyAndTags: true,
    hideDescriptionTags: true,
  },
  training: {
    id: 'training',
    desktopTabs: ['description', 'solutions', 'submissions'],
    mobileTabs: ['description', 'code', 'submissions', 'solutions'],
    dense: true,
    hideDifficultyAndTags: false,
    hideDescriptionTags: true,
  },
  assignment: {
    id: 'assignment',
    desktopTabs: ['description', 'submissions'],
    mobileTabs: ['description', 'code', 'submissions'],
    dense: true,
    hideDifficultyAndTags: false,
    hideDescriptionTags: true,
  },
}

const DESKTOP_TAB_META: Record<
  WorkspaceDesktopTab,
  { label: string; icon: LucideIcon }
> = {
  description: { label: '题目描述', icon: BookOpen },
  solutions: { label: '题解', icon: MessageSquare },
  submissions: { label: '提交记录', icon: ListChecks },
  stats: { label: '统计', icon: BarChart3 },
}

const MOBILE_TAB_META: Record<WorkspaceTab, { label: string; icon: LucideIcon }> = {
  description: { label: '题面', icon: FileText },
  code: { label: '代码', icon: CodeIcon },
  submissions: { label: '提交', icon: History },
  solutions: { label: '题解', icon: MessageSquare },
  stats: { label: '统计', icon: BarChart3 },
}

/** 桌面 Tab 栏左侧：当前题号字母 + 标题（竞赛/训练/作业共用） */
export function ProblemWorkspaceSelectedTitle({
  letter,
  title,
  maxWidthClass = 'max-w-[40%]',
}: {
  letter: string
  title: string
  maxWidthClass?: string
}) {
  return (
    <div
      className={`hidden lg:flex items-center gap-2 px-4 py-2.5 border-r border-border min-w-0 ${maxWidthClass} shrink`}
    >
      <span className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary-light font-mono text-xs font-bold flex items-center justify-center">
        {letter}
      </span>
      <span className="truncate text-sm font-medium text-foreground" title={title}>
        {title}
      </span>
    </div>
  )
}

export function ProblemWorkspaceDesktopTabs({
  tabs,
  activeTab,
  onChange,
  layoutId,
  leading,
  dense = true,
}: {
  tabs: WorkspaceDesktopTab[]
  activeTab: WorkspaceTab
  onChange: (tab: WorkspaceDesktopTab) => void
  /** framer-motion layoutId，各入口需唯一以免动画串扰 */
  layoutId: string
  leading?: ReactNode
  dense?: boolean
}) {
  const pad = dense ? 'px-3.5 py-2.5' : 'px-5 py-3.5'
  return (
    <>
      {leading}
      {tabs.map((key) => {
        const meta = DESKTOP_TAB_META[key]
        const Icon = meta.icon
        const isActive = activeTab === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 ${pad} text-sm font-medium transition-all duration-300 relative cursor-pointer whitespace-nowrap ${
              isActive
                ? 'text-primary-light'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <Icon
              className={`w-3.5 h-3.5 transition-transform duration-300 ${isActive ? 'rotate-3' : ''}`}
            />
            {meta.label}
          </button>
        )
      })}
    </>
  )
}

export function ProblemWorkspaceMobileTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
}) {
  const cols =
    tabs.length <= 3 ? 'grid-cols-3' : tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-5'

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-border z-40 lg:hidden">
      <div className={`grid ${cols}`}>
        {tabs.map((key) => {
          const meta = MOBILE_TAB_META[key]
          const Icon = meta.icon
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex flex-col items-center justify-center py-3 gap-1 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{meta.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
