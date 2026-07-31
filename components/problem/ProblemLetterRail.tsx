'use client'

/**
 * 题号轨：作业 / 竞赛 / 题单三栏布局共用
 * 桌面竖排窄栏，移动端横滑；点击仅切换选中，不跳转路由。
 */
import type { ReactNode } from 'react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export type ProblemLetterStatus = 'AC' | 'Attempted' | null

export interface ProblemLetterRailItem {
  id: string
  label?: string
  title: string
  status?: ProblemLetterStatus
  /** 显示在字母下方的副文案，如「80分」；不传则不显示 */
  subtitle?: string
}

interface ProblemLetterRailProps {
  problems: ProblemLetterRailItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  ariaLabel?: string
  /** 每题字母块下方的扩展区（如作业计时器） */
  renderItemExtra?: (
    problem: ProblemLetterRailItem,
    index: number,
    isSelected: boolean
  ) => ReactNode
}

export default function ProblemLetterRail({
  problems,
  selectedIndex,
  onSelect,
  ariaLabel = '题目列表',
  renderItemExtra,
}: ProblemLetterRailProps) {
  if (problems.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无题目</div>
    )
  }

  return (
    <div
      className="flex lg:flex-col gap-1.5 p-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-11rem)]"
      role="listbox"
      aria-label={ariaLabel}
    >
      {problems.map((problem, index) => {
        const isSelected = index === selectedIndex
        const letter = problem.label || LETTERS[index] || String(index + 1)
        const status = problem.status ?? null

        return (
          <button
            key={problem.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            title={problem.title}
            onClick={() => onSelect(index)}
            className={`flex flex-col items-center gap-1 shrink-0 w-[3.5rem] lg:w-full px-1 py-2 rounded-lg transition-colors ${
              isSelected ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted/60'
            }`}
          >
            <span
              className={`relative w-8 h-8 rounded-md font-mono font-bold text-sm flex items-center justify-center border transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : status === 'AC'
                    ? 'bg-secondary/10 text-secondary border-secondary/30'
                    : status === 'Attempted'
                      ? 'bg-warning/10 text-warning border-warning/30'
                      : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {letter}
              {status === 'AC' && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-secondary rounded-full border border-white dark:border-card" />
              )}
            </span>
            {problem.subtitle != null && problem.subtitle !== '' && (
              <span
                className={`text-xs font-semibold tabular-nums leading-none ${
                  status === 'AC'
                    ? 'text-secondary'
                    : status === 'Attempted'
                      ? 'text-accent'
                      : 'text-muted-foreground/70'
                }`}
              >
                {problem.subtitle}
              </span>
            )}
            {renderItemExtra?.(problem, index, isSelected)}
          </button>
        )
      })}
    </div>
  )
}
