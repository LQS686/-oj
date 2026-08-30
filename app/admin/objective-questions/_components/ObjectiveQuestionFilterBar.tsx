'use client'

import { Search, RotateCcw } from 'lucide-react'
import { FilterBar } from '@/components/admin'
import {
  OBJECTIVE_QUESTION_TYPES,
  OBJECTIVE_QUESTION_TYPE_LABELS,
} from '@/lib/objective-question/types'
import { OBJECTIVE_DIFFICULTIES } from '@/lib/objective-question/validation'
import { countActiveFilters, type ObjectiveQuestionFilters } from '../_utils'

interface ObjectiveQuestionFilterBarProps {
  filters: ObjectiveQuestionFilters
  onFiltersChange: (patch: Partial<ObjectiveQuestionFilters>) => void
  onReset: () => void
}

/**
 * 客观题列表筛选栏：关键词搜索 / 题型 / 难度。
 * 所有筛选实时生效，不需要"应用"按钮。
 */
export function ObjectiveQuestionFilterBar({
  filters,
  onFiltersChange,
  onReset,
}: ObjectiveQuestionFilterBarProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <FilterBar activeCount={activeCount} onReset={onReset}>
      <div className="flex flex-wrap items-end gap-4 w-full">
        {/* 1. 关键词搜索（题号 / 题干） */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            搜索
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索题号 / 题干..."
              value={filters.keyword}
              onChange={e => onFiltersChange({ keyword: e.target.value })}
              className="input pl-9 py-2 text-sm w-full"
            />
          </div>
        </div>

        {/* 2. 题型下拉 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            题型
          </label>
          <select
            value={filters.type}
            onChange={e =>
              onFiltersChange({
                type: e.target.value as ObjectiveQuestionFilters['type'],
              })
            }
            className="input py-2 text-sm min-w-[8rem]"
          >
            <option value="all">全部题型</option>
            {OBJECTIVE_QUESTION_TYPES.map(t => (
              <option key={t} value={t}>
                {OBJECTIVE_QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* 3. 难度下拉 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            难度
          </label>
          <select
            value={filters.difficulty}
            onChange={e =>
              onFiltersChange({
                difficulty: e.target.value as ObjectiveQuestionFilters['difficulty'],
              })
            }
            className="input py-2 text-sm min-w-[7rem]"
          >
            <option value="all">全部难度</option>
            {OBJECTIVE_DIFFICULTIES.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* 4. 重置按钮：仅在有任意筛选激活时显示 */}
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
