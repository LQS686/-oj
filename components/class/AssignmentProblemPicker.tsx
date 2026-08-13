'use client'

import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { ProblemPicker } from '@/components/common'
import {
  type ProblemPickItem,
  moveProblemInOrder,
  removeProblemFromOrder,
  orderProblemsByIds,
} from '@/lib/assignment/problemSelection'

export default function AssignmentProblemPicker({
  orderedIds,
  onChange,
  problems,
  problemsLoading,
}: {
  orderedIds: string[]
  onChange: (ids: string[]) => void
  problems: ProblemPickItem[]
  problemsLoading?: boolean
}) {
  // 渲染后的可见题目数（orderedIds 可能含已删除的孤儿 id，会被 orderProblemsByIds 过滤）
  const selectedCount = orderProblemsByIds(problems, orderedIds).length

  return (
    <ProblemPicker
      problems={problems}
      problemsLoading={problemsLoading}
      selectedIds={orderedIds}
      onChange={onChange}
      sortable
      emptyText="尚未添加题目，请在上方搜索或输入题号后点击「添加」"
      renderSelectedItem={(problem, index) => (
        <>
          <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{index + 1}.</span>
          <span className="text-xs font-mono text-muted-foreground shrink-0">{problem.problemNumber}</span>
          <span className="truncate flex-1 min-w-0 font-medium">{problem.title}</span>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onChange(moveProblemInOrder(orderedIds, index, 'up'))}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
              aria-label="上移"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={index === selectedCount - 1}
              onClick={() => onChange(moveProblemInOrder(orderedIds, index, 'down'))}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
              aria-label="下移"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChange(removeProblemFromOrder(orderedIds, problem.id))}
              className="p-1 rounded hover:bg-error/10 text-error"
              aria-label="移除"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    />
  )
}
