'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useForbiddenRedirect } from '@/hooks/useForbiddenRedirect'
import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import type { Problem, ProblemListStats } from '../_types'
import type { ProblemFilters } from '../_utils'

/**
 * 题目列表的数据获取 hook（服务端分页 + 服务端筛选）。
 *
 * - fetchProblems: 按当前 page / pageSize / filters 请求 /api/admin/problems
 *   （首次加载走 initialLoading，后续刷新走 loading）
 * - page / pageSize / filters 任一变化都会自动重新请求
 * - total: 后端返回的筛选后总条数（用于分页显示完整总数）
 * - allTags / allSources: 后端按当前筛选条件聚合的标签/来源（供筛选下拉使用）
 * - toggleVisibility: 行内切换可见性，乐观更新本地 state（public → private → contest → public 循环）
 *
 * 403 时设置错误并跳转 /403，与原实现保持一致。
 */
export function useProblemList(filters: ProblemFilters) {
  const scheduleForbiddenRedirect = useForbiddenRedirect()
  const dialog = useDialog()
  const [problems, setProblems] = useState<Problem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [allSources, setAllSources] = useState<string[]>([])
  const [stats, setStats] = useState<ProblemListStats | null>(null)
  // 分页状态：服务端分页，每次只拉取一页数据
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 筛选条件防抖：搜索框每 keystroke 都会触发 filters 变化，
  // 统一延迟 250ms 再请求，避免快速输入时发出大量请求
  const [debouncedFilters, setDebouncedFilters] = useState(filters)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 250)
    return () => clearTimeout(timer)
  }, [filters])

  // 请求序号：防止旧响应晚到覆盖新数据（快速输入 / 翻页竞态）
  const fetchSeq = useRef(0)

  // 根据当前 page / pageSize / debouncedFilters 构造请求 URL
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    const q = debouncedFilters.searchQuery.trim()
    if (q) params.set('q', q)
    if (debouncedFilters.difficultyFilter.length > 0) {
      params.set('difficulty', debouncedFilters.difficultyFilter.join(','))
    }
    if (debouncedFilters.visibility !== 'all') {
      params.set('visibility', debouncedFilters.visibility)
    }
    if (debouncedFilters.tags.length > 0) {
      params.set('tags', debouncedFilters.tags.join(','))
    }
    if (debouncedFilters.sources.length > 0) {
      params.set('source', debouncedFilters.sources.join(','))
    }
    if (debouncedFilters.completeness !== 'all') {
      params.set('completeness', debouncedFilters.completeness)
    }
    return `/api/admin/problems?${params.toString()}`
  }, [page, pageSize, debouncedFilters])

  const fetchProblems = useCallback(async (isInitial = false) => {
    const seq = ++fetchSeq.current
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }
      const response = await fetchWithCookie(buildUrl())

      // 竞态守卫：若期间又发起了新请求（翻页/筛选变化），丢弃本次过期响应
      if (seq !== fetchSeq.current) return

      if (response.status === 403) {
        setError('需要管理员权限')
        scheduleForbiddenRedirect()
        return
      }

      const data = await response.json()
      if (seq !== fetchSeq.current) return
      if (data.success) {
        const payload = data.data
        const rows = Array.isArray(payload?.data) ? payload.data : []
        const nextTotal = typeof payload?.pagination?.total === 'number'
          ? payload.pagination.total
          : 0
        // 当前页已空但还有数据（如删除了末页最后一题）：回退一页触发重新请求
        if (rows.length === 0 && nextTotal > 0 && page > 1) {
          setPage(page - 1)
          return
        }
        setProblems(rows)
        setTotal(nextTotal)
        setAllTags(Array.isArray(payload?.meta?.availableTags) ? payload.meta.availableTags : [])
        setAllSources(Array.isArray(payload?.meta?.availableSources) ? payload.meta.availableSources : [])
        setStats(payload?.stats ?? null)
      } else {
        setError(data.error || '获取题目列表失败')
        setProblems([])
        setTotal(0)
        setStats(null)
      }
    } catch {
      if (seq !== fetchSeq.current) return
      setError('网络错误')
    } finally {
      if (seq === fetchSeq.current) {
        setLoading(false)
        setInitialLoading(false)
      }
    }
  }, [buildUrl, scheduleForbiddenRedirect, page])

  const toggleVisibility = useCallback(async (problemId: string, currentVisibility: string) => {
    const nextVisibility =
      currentVisibility === 'public' ? 'private' :
      currentVisibility === 'private' ? 'contest' : 'public'

    try {
      const response = await fetchWithCookie(`/api/admin/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: nextVisibility })
      })

      const data = await response.json()
      if (data.success) {
        setProblems(prev => prev.map(p =>
          p.id === problemId
            ? { ...p, visibility: nextVisibility, isPublic: nextVisibility === 'public' }
            : p
        ))
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '操作失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    }
  }, [dialog])

  // page / pageSize / filters 变化时自动重新请求；首次渲染走 initialLoading
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchProblems(true)
    } else {
      fetchProblems()
    }
  }, [fetchProblems])

  return {
    problems,
    total,
    stats,
    loading,
    initialLoading,
    error,
    fetchProblems,
    toggleVisibility,
    allTags,
    allSources,
    page,
    pageSize,
    setPage,
    setPageSize,
  }
}
