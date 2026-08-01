'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, X, ListPlus, Search, Plus } from 'lucide-react'
import {
  type ProblemPickItem,
  addProblemsByNumbers,
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
  const [batchInput, setBatchInput] = useState('')
  const [batchHint, setBatchHint] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const selectedOrdered = orderProblemsByIds(problems, orderedIds)
  const selectedIdSet = useMemo(() => new Set(orderedIds), [orderedIds])

  // 客户端搜索：从已加载的全部公开题中过滤（作业不允许竞赛专用题）
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return problems
      .filter((p) => {
        const byTitle = p.title.toLowerCase().includes(q)
        const byNumber = p.problemNumber.toLowerCase().includes(q)
        return byTitle || byNumber
      })
      .filter((p) => !selectedIdSet.has(p.id))
      .slice(0, 8)
  }, [searchQuery, problems, selectedIdSet])

  const handleBatchAdd = () => {
    if (!batchInput.trim()) {
      setBatchHint('请输入题号')
      return
    }
    const { ids, notFound, added } = addProblemsByNumbers(orderedIds, problems, batchInput)
    onChange(ids)
    if (notFound.length > 0) {
      setBatchHint(`未找到：${notFound.join('、')}${added > 0 ? `；已添加 ${added} 题` : ''}`)
    } else if (added > 0) {
      setBatchHint(`已按输入顺序添加 ${added} 题`)
      setBatchInput('')
    } else {
      setBatchHint('没有新题目可添加（可能已在列表中）')
    }
  }

  const handleSearchAdd = (problem: ProblemPickItem) => {
    onChange([...orderedIds, problem.id])
    setSearchQuery('')
  }

  if (problemsLoading) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm py-8">
        加载题库中…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 搜索添加 */}
      <div className="relative">
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          搜索添加题目
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="输入题目名称或题号进行搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full pl-10"
          />
          <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 card rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-border">
            {searchResults.map((problem) => (
              <button
                key={problem.id}
                type="button"
                onClick={() => handleSearchAdd(problem)}
                className="w-full px-4 py-3 text-left hover:bg-primary/5 flex justify-between items-center group transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded text-sm group-hover:bg-primary/10 group-hover:text-primary-light transition-colors">
                    {problem.problemNumber}
                  </span>
                  <span className="font-medium text-foreground group-hover:text-primary-light">{problem.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    problem.difficulty === '入门' ? 'bg-secondary/10 text-secondary-light' :
                    problem.difficulty.includes('普及') ? 'bg-accent/10 text-accent-light' :
                    'bg-error/10 text-error'
                  }`}>
                    {problem.difficulty}
                  </span>
                  <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary-light" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 批量添加 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-primary-light">
          批量添加题目
        </label>
        <p className="text-xs text-muted-foreground">
          输入题号，英文或中文逗号分隔，如 <span className="font-mono text-foreground">P1001,P1002,P1005</span>
          ，将按输入顺序加入作业。
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={batchInput}
            onChange={(e) => {
              setBatchInput(e.target.value)
              setBatchHint('')
            }}
            placeholder="P1001,P1002,P1005,P1003"
            className="input w-full min-w-0 flex-1 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleBatchAdd())}
          />
          <button type="button" onClick={handleBatchAdd} className="btn btn-primary btn-sm shrink-0 inline-flex items-center gap-1">
            <ListPlus className="w-4 h-4" />
            添加
          </button>
        </div>
        {batchHint ? <p className="text-xs text-muted-foreground">{batchHint}</p> : null}
      </div>

      {/* 已选题目列表 */}
      <div className="flex flex-col">
        <p className="text-xs font-medium text-foreground mb-2">
          已选题目（共 {orderedIds.length} 题，可调整顺序）
        </p>
        {selectedOrdered.length === 0 ? (
          <div className="min-h-[6rem] rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
            尚未添加题目，请在上方搜索或输入题号后点击「添加」
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {selectedOrdered.map((problem, index) => (
              <div
                key={problem.id}
                className="flex items-center gap-2 px-3 py-2.5 text-sm bg-card hover:bg-muted/30"
              >
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
                    disabled={index === selectedOrdered.length - 1}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
