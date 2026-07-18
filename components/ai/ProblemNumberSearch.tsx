'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, AlertCircle, X, FileText } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'

/** 题目精简信息（搜索结果） */
export interface ProblemSearchItem {
  id: string
  problemNumber: string | null
  title: string
  difficulty?: string
  tags?: string[]
}

/** 题目完整信息（选中后加载，含 testCases） */
export interface ProblemFullInfo extends ProblemSearchItem {
  description?: string
  input?: string
  output?: string
  samples?: Array<{ input: string; output: string; explanation?: string }>
  hint?: string
  timeLimit?: number
  memoryLimit?: number
  isAiGenerated?: boolean
  testCases?: Array<{
    id?: string
    input: string
    output: string
    orderIndex?: number
    isSample?: boolean
    score?: number
  }>
}

interface ProblemNumberSearchProps {
  /** 选中题目后回调（传入完整题目信息） */
  onProblemSelected: (problem: ProblemFullInfo) => void
  /** 默认题号（从 URL query 预填） */
  defaultProblemId?: string
  /** 是否在选中后自动加载完整信息（默认 true） */
  autoLoadDetail?: boolean
  /** 占位提示文案 */
  placeholder?: string
  /** 自定义 className */
  className?: string
}

/**
 * 题号模糊搜索选择器
 *
 * 交互流程：
 * 1. 用户输入题号（P1000 / 1000 / 部分标题）→ debounce 300ms → 服务端模糊搜索
 * 2. 下拉显示匹配列表（题号 + 标题 + 难度）
 * 3. 选中后自动调 GET /api/admin/problems/[id] 加载完整信息（含 testCases）
 * 4. 回调 onProblemSelected 传给父组件
 *
 * 数据源：GET /api/admin/problems?q=xxx&page=1&pageSize=20（服务端模糊搜索 + 分页）
 *
 * 与早期实现的差异：
 * - 不再一次性加载全部题目（1000+ 题时浏览器卡顿）
 * - 改为基于 query 的服务端搜索 + debounce，减少请求量
 * - 空查询时不发起请求，下拉显示"请输入题号或标题关键字"提示
 */
export function ProblemNumberSearch({
  onProblemSelected,
  defaultProblemId,
  autoLoadDetail = true,
  placeholder = '输入题号（如 P1000）或标题关键字',
  className = '',
}: ProblemNumberSearchProps) {
  const [searchResults, setSearchResults] = useState<ProblemSearchItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<ProblemFullInfo | null>(null)
  const [error, setError] = useState('')

  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  /* ---------- debounce 服务端搜索 ---------- */
  useEffect(() => {
    // 已选中题目时不触发搜索（避免选中后 query 变化触发新请求）
    if (selected) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const q = query.trim()
    if (!q) {
      setSearchResults([])
      setLoadingList(false)
      return
    }

    setLoadingList(true)
    const currentRequestId = ++requestIdRef.current

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(
          `/api/admin/problems?q=${encodeURIComponent(q)}&page=1&pageSize=20`
        )
        const data = await res.json()
        // 仅保留最新一次请求的结果，避免乱序覆盖
        if (currentRequestId !== requestIdRef.current) return
        if (data.success) {
          const list = data.data?.data || data.data?.items || (Array.isArray(data.data) ? data.data : [])
          setSearchResults(list.map((p: any) => ({
            id: p.id,
            problemNumber: p.problemNumber,
            title: p.title,
            difficulty: p.difficulty,
            tags: p.tags,
          })))
        } else {
          setSearchResults([])
        }
      } catch (err) {
        logger.error('搜索题目失败', err)
        if (currentRequestId === requestIdRef.current) setSearchResults([])
      } finally {
        if (currentRequestId === requestIdRef.current) setLoadingList(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selected])

  /* ---------- 默认 problemId：自动加载 ---------- */
  useEffect(() => {
    if (!defaultProblemId || selected) return
    ;(async () => {
      await loadProblemDetail(defaultProblemId)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultProblemId])

  /* ---------- 加载题目详情 ---------- */
  const loadProblemDetail = async (id: string): Promise<ProblemFullInfo | null> => {
    setLoadingDetail(true)
    setError('')
    try {
      const res = await fetchWithAuth(`/api/admin/problems/${id}`)
      const data = await res.json()
      if (data.success && data.data) {
        const p = data.data
        const full: ProblemFullInfo = {
          id: p.id,
          problemNumber: p.problemNumber,
          title: p.title,
          difficulty: p.difficulty,
          tags: p.tags,
          description: p.description,
          input: p.input,
          output: p.output,
          samples: p.samples,
          hint: p.hint,
          timeLimit: p.timeLimit,
          memoryLimit: p.memoryLimit,
          isAiGenerated: p.isAiGenerated,
          testCases: p.testCases?.map((tc: any) => ({
            id: tc.id,
            input: tc.input,
            output: tc.output,
            orderIndex: tc.orderIndex,
            isSample: tc.isSample,
            score: tc.score,
          })),
        }
        setSelected(full)
        setQuery(p.problemNumber || p.title)
        setShowDropdown(false)
        onProblemSelected(full)
        return full
      }
      setError('题目不存在')
      return null
    } catch (err) {
      logger.error('加载题目详情失败', err)
      setError('加载题目详情失败')
      return null
    } finally {
      setLoadingDetail(false)
    }
  }

  /* ---------- 点击外部关闭下拉 ---------- */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (item: ProblemSearchItem) => {
    loadProblemDetail(item.id)
  }

  const handleClear = () => {
    setSelected(null)
    setQuery('')
    setSearchResults([])
    setError('')
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShowDropdown(true)
              if (selected) setSelected(null)
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder={placeholder}
            disabled={loadingDetail}
            className="input pl-9 pr-9"
          />
          {(selected || query) && !loadingDetail && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="清除"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {loadingDetail && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
          )}
        </div>
      </div>

      {/* 下拉匹配列表 */}
      {showDropdown && !selected && !loadingDetail && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto custom-scrollbar">
          {loadingList ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              搜索中...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query.trim() ? '未找到匹配的题目' : '请输入题号或标题关键字'}
            </div>
          ) : (
            searchResults.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className="w-full px-4 py-2.5 text-left hover:bg-muted flex items-center gap-2 border-b border-border/50 last:border-0"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                {p.problemNumber && (
                  <code className="text-xs font-mono text-primary flex-shrink-0">{p.problemNumber}</code>
                )}
                <span className="text-sm text-foreground truncate flex-1">{p.title}</span>
                {p.difficulty && (
                  <span className="tag text-xs flex-shrink-0">{p.difficulty}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="mt-1 text-xs text-error flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}

export default ProblemNumberSearch
