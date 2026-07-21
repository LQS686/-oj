'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, Check, X, RotateCcw } from 'lucide-react'
import { FilterBar } from '@/components/admin'
import { DIFFICULTIES } from '@/lib/constants'
import { getDifficultyColor } from '@/lib/status'
import { countActiveFilters, type ProblemFilters } from '../_utils'

interface ProblemFilterBarProps {
  filters: ProblemFilters
  onFiltersChange: (patch: Partial<ProblemFilters>) => void
  onReset: () => void
  allTags: string[]
  allSources: string[]
}

interface MultiSelectDropdownProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (newSelected: string[]) => void
  placeholder?: string
}

/**
 * 多选下拉组件（内部组件，不导出）。
 *
 * - 触发器显示 "全部 X" 或 "已选 N 个"
 * - 下拉内支持实时搜索过滤
 * - 选项以 checkbox 形式呈现，点击切换选中状态但不关闭下拉
 * - 点击外部关闭下拉
 * - 已选项以 chip 形式展示在触发器下方，chip 上 X 可移除
 */
function MultiSelectDropdown({ label, options, selected, onChange, placeholder }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(o => o.toLowerCase().includes(query.toLowerCase()))

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  const removeOption = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selected.filter(s => s !== opt))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border bg-background hover:bg-muted transition-colors min-w-[8rem] ${
          selected.length > 0 ? 'border-primary/40 text-primary' : 'text-muted-foreground'
        }`}
      >
        <span className="truncate">
          {selected.length === 0 ? label : `已选 ${selected.length} 个`}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 已选 chips */}
      {selected.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 flex flex-wrap gap-1 z-10">
          {selected.map(s => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs"
            >
              <span className="max-w-[80px] truncate">{s}</span>
              <button
                type="button"
                onClick={(e) => removeOption(s, e)}
                className="hover:bg-primary/20 rounded p-0.5"
                aria-label={`移除 ${s}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 z-[60] mt-1 w-64 max-w-[calc(100vw-2rem)] max-h-72 rounded-lg border border-border bg-background shadow-lg">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder || '搜索...'}
              className="input text-sm py-1.5"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">无匹配项</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = selected.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 border rounded flex items-center justify-center ${
                        isSelected ? 'border-primary bg-primary text-white' : 'border-border'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 题目列表筛选栏：多维度组合筛选。
 *
 * 维度：关键字搜索 / 难度多选 / 可见性 / 标签多选 / 来源多选 / 数据完整度。
 * 所有筛选实时生效，不需要"应用"按钮。
 */
export function ProblemFilterBar({
  filters,
  onFiltersChange,
  onReset,
  allTags,
  allSources,
}: ProblemFilterBarProps) {
  const activeCount = countActiveFilters(filters)

  // 难度 chip 切换：已选则移除，未选则添加
  const toggleDifficulty = (d: string) => {
    const selected = filters.difficultyFilter.includes(d)
    const next = selected
      ? filters.difficultyFilter.filter(x => x !== d)
      : [...filters.difficultyFilter, d]
    onFiltersChange({ difficultyFilter: next })
  }

  return (
    <FilterBar activeCount={activeCount} onReset={onReset}>
      <div className="flex flex-wrap items-end gap-4 w-full">
        {/* 1. 关键字搜索 */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">搜索</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索题号 / 标题 / 来源..."
              value={filters.searchQuery}
              onChange={e => onFiltersChange({ searchQuery: e.target.value })}
              className="input pl-9 py-2 text-sm w-full"
            />
          </div>
        </div>

        {/* 2. 难度多选 chips */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">难度</label>
          <div className="flex flex-wrap gap-1 max-w-md">
            {DIFFICULTIES.map(d => {
              const selected = filters.difficultyFilter.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDifficulty(d)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors flex items-center gap-1.5 ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getDifficultyColor(d)}`} />
                  {d}
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. 可见性分段按钮 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">可见性</label>
          <div className="inline-flex border border-border rounded-lg overflow-hidden">
            {([
              { v: 'all', l: '全部' },
              { v: 'public', l: '公开' },
              { v: 'private', l: '隐藏' },
              { v: 'contest', l: '竞赛' },
            ] as const).map(opt => {
              const selected = filters.visibility === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => onFiltersChange({ visibility: opt.v })}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    selected ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.l}
                </button>
              )
            })}
          </div>
        </div>

        {/* 4. 标签多选下拉 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">标签</label>
          <MultiSelectDropdown
            label="全部标签"
            options={allTags}
            selected={filters.tags}
            onChange={newTags => onFiltersChange({ tags: newTags })}
            placeholder="搜索标签..."
          />
        </div>

        {/* 5. 来源多选下拉 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">来源</label>
          <MultiSelectDropdown
            label="全部来源"
            options={allSources}
            selected={filters.sources}
            onChange={newSources => onFiltersChange({ sources: newSources })}
            placeholder="搜索来源..."
          />
        </div>

        {/* 6. 数据完整度分段按钮 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">数据完整度</label>
          <div className="inline-flex border border-border rounded-lg overflow-hidden">
            {([
              { v: 'all', l: '全部' },
              { v: 'hasStd', l: '有标程' },
              { v: 'noStd', l: '无标程' },
              { v: 'hasTests', l: '有测试点' },
              { v: 'noTests', l: '无测试点' },
            ] as const).map(opt => {
              const selected = filters.completeness === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => onFiltersChange({ completeness: opt.v })}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    selected ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.l}
                </button>
              )
            })}
          </div>
        </div>

        {/* 7. 重置按钮：仅在有任意筛选激活时显示 */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="btn btn-ghost btn-sm flex items-center gap-1 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        )}
      </div>
    </FilterBar>
  )
}
