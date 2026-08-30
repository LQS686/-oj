'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useForbiddenRedirect } from '@/hooks/useForbiddenRedirect'
import { fetchWithCookie } from '@/lib/api/base'
import type { ObjectiveQuestionFilters, ObjectiveQuestionRow } from '../_types'

/**
 * 客观题列表的数据获取 hook（服务端分页 + 服务端筛选）。
 *
 * - fetchQuestions: 按当前 page / pageSize / filters 请求 /api/admin/objective-questions
 *   （首次加载走 initialLoading，后续刷新走 loading）
 * - page / pageSize / filters 任一变化都会自动重新请求
 * - total: 后端返回的筛选后总条数（用于分页与「共 N 题」统计行）
 * - deleteQuestion: 删除单题，成功后自动刷新列表；
 *   被作业引用时后端返回 400，错误信息（含引用数）透传给调用方展示
 *
 * 403 时设置错误并跳转 /403，与 useProblemList 保持一致。
 */
export function useObjectiveQuestionList(filters: ObjectiveQuestionFilters) {
  const scheduleForbiddenRedirect = useForbiddenRedirect()
  const [questions, setQuestions] = useState<ObjectiveQuestionRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
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
    const keyword = debouncedFilters.keyword.trim()
    if (keyword) params.set('keyword', keyword)
    if (debouncedFilters.type !== 'all') {
      params.set('type', debouncedFilters.type)
    }
    if (debouncedFilters.difficulty !== 'all') {
      params.set('difficulty', debouncedFilters.difficulty)
    }
    return `/api/admin/objective-questions?${params.toString()}`
  }, [page, pageSize, debouncedFilters])

  const fetchQuestions = useCallback(async (isInitial = false) => {
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
        const rows = Array.isArray(payload?.list) ? payload.list : []
        const nextTotal = typeof payload?.total === 'number' ? payload.total : 0
        // 当前页已空但还有数据（如删除了末页最后一题）：回退一页触发重新请求
        if (rows.length === 0 && nextTotal > 0 && page > 1) {
          setPage(page - 1)
          return
        }
        setQuestions(rows)
        setTotal(nextTotal)
      } else {
        setError(data.error || '获取客观题列表失败')
        setQuestions([])
        setTotal(0)
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

  /**
   * 删除单题。成功后刷新列表；失败（含被作业引用的 400）返回后端错误信息，
   * 由调用方决定如何展示（如「该题目已被 N 个作业引用，无法删除」）。
   */
  const deleteQuestion = useCallback(
    async (questionId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const response = await fetchWithCookie(
          `/api/admin/objective-questions/${questionId}`,
          { method: 'DELETE' }
        )
        const data = await response.json()
        if (data.success) {
          void fetchQuestions()
          return { ok: true }
        }
        return { ok: false, error: data.error || '删除失败' }
      } catch {
        return { ok: false, error: '网络错误，请稍后重试' }
      }
    },
    [fetchQuestions]
  )

  // page / pageSize / filters 变化时自动重新请求；首次渲染走 initialLoading
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchQuestions(true)
    } else {
      fetchQuestions()
    }
  }, [fetchQuestions])

  return {
    questions,
    total,
    loading,
    initialLoading,
    error,
    fetchQuestions,
    deleteQuestion,
    page,
    pageSize,
    setPage,
    setPageSize,
  }
}
