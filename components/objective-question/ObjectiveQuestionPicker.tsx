'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, X, Search, ListPlus, Plus } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import {
  moveProblemInOrder,
  removeProblemFromOrder,
} from '@/lib/assignment/problemSelection'
import {
  OBJECTIVE_QUESTION_TYPES,
  OBJECTIVE_QUESTION_TYPE_LABELS,
  OBJECTIVE_QUESTION_TYPE_TAG_CLASSES,
  type ObjectiveQuestionType,
} from '@/lib/objective-question/types'

/** 客观题选择条目摘要（不含 answer/explanation，防止答案泄露） */
export interface ObjectiveQuestionPickItem {
  id: string
  questionNumber: string | null
  type: ObjectiveQuestionType
  title: string
  difficulty: string
  score: number
}

/** 解析客观题题号输入：Q1001,Q1002 或 1001 1002（纯数字自动补 Q 前缀） */
function parseQuestionNumberTokens(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const upper = token.toUpperCase()
      if (/^Q\d+$/.test(upper)) return upper
      if (/^\d+$/.test(token)) return `Q${token}`
      return upper
    })
}

const SEARCH_PAGE_SIZE = 20

/** 客观题难度对应的展示类名 */
function difficultyClass(difficulty: string) {
  if (difficulty === '简单') return 'bg-secondary/10 text-secondary-light'
  if (difficulty === '中等') return 'bg-accent/10 text-accent-light'
  return 'bg-error/10 text-error'
}

/**
 * 客观题选择器（与 AssignmentProblemPicker 同构：搜索添加 + 按题号批量添加 + 已选有序列表）。
 *
 * 数据来自 GET /api/objective-questions（服务端分页 + keyword/type 筛选）：
 * - 搜索结果点击后把题目摘要写入内部缓存（Map），供已选列表展示；
 * - 编辑模式由父组件通过 items 传入初始已选题目摘要。
 */
export default function ObjectiveQuestionPicker({
  value,
  onChange,
  items = [],
}: {
  /** 已选客观题 id（保持添加顺序） */
  value: string[]
  onChange: (ids: string[]) => void
  /** 初始已选客观题摘要（编辑模式由父组件传入，按作业详情顺序） */
  items?: ObjectiveQuestionPickItem[]
}) {
  // 已选题目的展示信息缓存：搜索/批量添加命中后写入；编辑模式由 items 播种
  const [knownItems, setKnownItems] = useState<Map<string, ObjectiveQuestionPickItem>>(
    () => new Map(items.map((q) => [q.id, q]))
  )

  // items 异步到达（编辑态作业详情加载完成）时合并进缓存
  useDeferredEffect(() => {
    if (items.length === 0) return
    setKnownItems((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const q of items) {
        if (!next.has(q.id)) {
          next.set(q.id, q)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items])

  // === 搜索添加（服务端 keyword + type 筛选） ===
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ObjectiveQuestionType>('all')
  const [results, setResults] = useState<ObjectiveQuestionPickItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  // 请求序号：防止旧响应晚到覆盖新数据（快速输入 / 加载更多竞态）
  const fetchSeq = useRef(0)

  // 关键词防抖：避免快速输入时发出大量请求（对齐 useProblemList 的 250ms 方案）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchResults = useCallback(
    async (targetPage: number, append: boolean) => {
      const seq = ++fetchSeq.current
      try {
        setSearchLoading(true)
        setSearchError('')
        const params = new URLSearchParams()
        params.set('page', String(targetPage))
        params.set('pageSize', String(SEARCH_PAGE_SIZE))
        const kw = debouncedQuery.trim()
        if (kw) params.set('keyword', kw)
        if (typeFilter !== 'all') params.set('type', typeFilter)
        const response = await fetchWithCookie(`/api/objective-questions?${params.toString()}`)
        if (seq !== fetchSeq.current) return
        const data = await response.json()
        if (seq !== fetchSeq.current) return
        if (!data.success) {
          setSearchError(data.error || '获取客观题列表失败')
          if (!append) {
            setResults([])
            setTotal(0)
          }
          return
        }
        const list: ObjectiveQuestionPickItem[] = Array.isArray(data.data?.list)
          ? data.data.list
          : []
        setTotal(typeof data.data?.total === 'number' ? data.data.total : 0)
        setPage(targetPage)
        setResults((prev) => (append ? [...prev, ...list] : list))
      } catch {
        if (seq !== fetchSeq.current) return
        setSearchError('获取客观题列表失败')
      } finally {
        if (seq === fetchSeq.current) setSearchLoading(false)
      }
    },
    [debouncedQuery, typeFilter]
  )

  // 关键词 / 题型变化时回到第一页重新搜索
  useDeferredEffect(() => {
    void fetchResults(1, false)
  }, [fetchResults])

  const hasMore = results.length < total
  const handleLoadMore = useCallback(() => {
    void fetchResults(page + 1, true)
  }, [fetchResults, page])

  // === 批量添加（按题号，逐号精确解析） ===
  const [batchInput, setBatchInput] = useState('')
  const [batchHint, setBatchHint] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)

  const selectedIdSet = useMemo(() => new Set(value), [value])
  const selectedOrdered = useMemo(
    () =>
      value.map((id) => knownItems.get(id)).filter(Boolean) as ObjectiveQuestionPickItem[],
    [value, knownItems]
  )

  const rememberItems = useCallback((questions: ObjectiveQuestionPickItem[]) => {
    setKnownItems((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const q of questions) {
        if (!next.has(q.id)) {
          next.set(q.id, q)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const handleSearchAdd = (q: ObjectiveQuestionPickItem) => {
    if (selectedIdSet.has(q.id)) return
    rememberItems([q])
    onChange([...value, q.id])
  }

  const handleBatchAdd = async () => {
    const tokens = parseQuestionNumberTokens(batchInput)
    if (tokens.length === 0) {
      setBatchHint('请输入题号')
      return
    }
    const uniqueTokens = Array.from(new Set(tokens))
    try {
      setBatchLoading(true)
      // keyword 命中「题号精确匹配 或 题干包含」，取题号精确命中项
      const foundPerToken = await Promise.all(
        uniqueTokens.map(async (token) => {
          try {
            const response = await fetchWithCookie(
              `/api/objective-questions?keyword=${encodeURIComponent(token)}&pageSize=20`
            )
            const data = await response.json()
            if (!data.success) return null
            const list: ObjectiveQuestionPickItem[] = Array.isArray(data.data?.list)
              ? data.data.list
              : []
            return list.find((q) => q.questionNumber === token) ?? null
          } catch {
            return null
          }
        })
      )
      const found = foundPerToken.filter(Boolean) as ObjectiveQuestionPickItem[]
      const notFoundTokens = uniqueTokens.filter((_, i) => !foundPerToken[i])
      const added = found.filter((q) => !selectedIdSet.has(q.id))
      if (added.length > 0) {
        rememberItems(added)
        onChange([...value, ...added.map((q) => q.id)])
      }
      if (notFoundTokens.length > 0) {
        setBatchHint(
          `未找到：${notFoundTokens.join('、')}${added.length > 0 ? `；已添加 ${added.length} 题` : ''}`
        )
      } else if (added.length > 0) {
        setBatchHint(`已按输入顺序添加 ${added.length} 题`)
        setBatchInput('')
      } else {
        setBatchHint('没有新题目可添加（可能已在列表中）')
      }
    } finally {
      setBatchLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 搜索添加 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          搜索添加客观题
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="输入题号或题干关键字进行搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
            <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | ObjectiveQuestionType)}
            className="input w-auto shrink-0"
            aria-label="题型筛选"
          >
            <option value="all">全部题型</option>
            {OBJECTIVE_QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {OBJECTIVE_QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* 搜索结果列表 */}
        {searchError ? (
          <p className="text-xs text-error">{searchError}</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
            {searchLoading && results.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                搜索客观题中…
              </div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                暂无匹配的客观题
              </div>
            ) : (
              <>
                {results.map((q) => {
                  const selected = selectedIdSet.has(q.id)
                  return (
                    <button
                      key={q.id}
                      type="button"
                      disabled={selected}
                      onClick={() => handleSearchAdd(q)}
                      className={`w-full px-3 py-2.5 text-left hover:bg-primary/5 flex justify-between items-center group transition-colors ${
                        selected ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                          {q.questionNumber || '—'}
                        </span>
                        <span
                          className={`tag shrink-0 ${OBJECTIVE_QUESTION_TYPE_TAG_CLASSES[q.type]}`}
                        >
                          {OBJECTIVE_QUESTION_TYPE_LABELS[q.type]}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {q.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${difficultyClass(q.difficulty)}`}
                        >
                          {q.difficulty}
                        </span>
                        <span className="text-xs text-muted-foreground">{q.score} 分</span>
                        {selected ? (
                          <span className="text-xs text-muted-foreground">已添加</span>
                        ) : (
                          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary-light" />
                        )}
                      </div>
                    </button>
                  )
                })}
                {hasMore && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={searchLoading}
                    className="w-full py-2.5 text-center text-sm text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {searchLoading ? '加载中…' : `加载更多（已加载 ${results.length}/${total}）`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 批量添加 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-primary-light">批量添加客观题</label>
        <p className="text-xs text-muted-foreground">
          输入题号，英文或中文逗号分隔，如{' '}
          <span className="font-mono text-foreground">Q1001,Q1002</span>
          （纯数字可省略 Q 前缀），将按输入顺序加入。
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={batchInput}
            onChange={(e) => {
              setBatchInput(e.target.value)
              setBatchHint('')
            }}
            placeholder="Q1001,Q1002,Q1005"
            className="input w-full min-w-0 flex-1 text-sm"
            disabled={batchLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleBatchAdd()
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleBatchAdd()}
            disabled={batchLoading}
            className="btn btn-primary btn-sm shrink-0 inline-flex items-center gap-1"
          >
            <ListPlus className="w-4 h-4" />
            {batchLoading ? '添加中...' : '添加'}
          </button>
        </div>
        {batchHint ? <p className="text-xs text-muted-foreground">{batchHint}</p> : null}
      </div>

      {/* 已选客观题列表 */}
      <div className="flex flex-col">
        <p className="text-xs font-medium text-foreground mb-2">
          已选客观题（共 {value.length} 题，可调整顺序）
        </p>
        {selectedOrdered.length === 0 ? (
          <div className="min-h-[6rem] rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
            尚未添加客观题，可在上方搜索或输入题号后点击「添加」
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {selectedOrdered.map((q, index) => (
              <div
                key={q.id}
                className="flex items-center gap-2 px-3 py-2.5 text-sm bg-card hover:bg-muted/30"
              >
                <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">
                  {index + 1}.
                </span>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {q.questionNumber || '—'}
                </span>
                <span className={`tag shrink-0 ${OBJECTIVE_QUESTION_TYPE_TAG_CLASSES[q.type]}`}>
                  {OBJECTIVE_QUESTION_TYPE_LABELS[q.type]}
                </span>
                <span className="truncate flex-1 min-w-0 font-medium">{q.title}</span>
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onChange(moveProblemInOrder(value, index, 'up'))}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30"
                    aria-label="上移"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === selectedOrdered.length - 1}
                    onClick={() => onChange(moveProblemInOrder(value, index, 'down'))}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30"
                    aria-label="下移"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(removeProblemFromOrder(value, q.id))}
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
