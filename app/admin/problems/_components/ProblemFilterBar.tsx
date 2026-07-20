'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'
import { FilterBar } from '@/components/admin'
import { DIFFICULTIES } from '@/lib/constants'
import { getDifficultyColor } from '@/lib/status'
import { getDifficultyLabel } from '../_utils'

interface ProblemFilterBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  difficultyFilter: string
  onDifficultyFilterChange: (value: string) => void
}

/**
 * 题目列表筛选栏：搜索框 + 难度下拉（单选）。
 *
 * 难度下拉的展开/收起与外部点击关闭由本组件内部管理。
 */
export function ProblemFilterBar({
  searchQuery,
  onSearchChange,
  difficultyFilter,
  onDifficultyFilterChange,
}: ProblemFilterBarProps) {
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const difficultyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (difficultyRef.current && !difficultyRef.current.contains(e.target as Node)) {
        setDifficultyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeCount =
    (searchQuery ? 1 : 0) +
    (difficultyFilter !== 'all' ? 1 : 0)

  return (
    <FilterBar activeCount={activeCount}>
      <div className="flex-1 min-w-[200px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索题目编号或标题..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input pl-9 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {/* 难度筛选：下拉单选，全站统一 8 级体系 */}
        <div className="relative" ref={difficultyRef}>
          <button
            type="button"
            onClick={() => setDifficultyOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted transition-colors max-w-[9rem] truncate ${
              difficultyFilter !== 'all' ? 'border-primary/40 text-primary' : 'text-foreground'
            }`}
          >
            <span className="truncate">{getDifficultyLabel(difficultyFilter)}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${difficultyOpen ? 'rotate-180' : ''}`} />
          </button>
          {difficultyOpen && (
            <div className="absolute right-0 z-[60] mt-1 w-44 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-1">
              <button
                type="button"
                onClick={() => { onDifficultyFilterChange('all'); setDifficultyOpen(false) }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
                  difficultyFilter === 'all' ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {difficultyFilter === 'all' && <Check className="w-4 h-4" />}
                <span className={difficultyFilter === 'all' ? '' : 'ml-6'}>全部难度</span>
              </button>
              {DIFFICULTIES.map(d => {
                const selected = difficultyFilter === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { onDifficultyFilterChange(d); setDifficultyOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
                      selected ? 'text-primary font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {selected && <Check className="w-4 h-4" />}
                    <span className={`difficulty-tag ${getDifficultyColor(d)} ${selected ? 'ml-0' : 'ml-6'}`}>{d}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </FilterBar>
  )
}
