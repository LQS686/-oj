'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { PAGE_SIZE } from '../_constants'
import { computeTodayCounts, groupTaskChains, isToday } from '../_utils'
import type { AiCostData, AiLogItem, LogsResponse, QueueStatusResponse } from '../_types'

/**
 * AI 监控页面的数据获取 hook。
 *
 * 负责队列状态、今日聚合、AI 成本、任务列表的拉取与轮询，
 * 以及重试 / 取消 / 翻页 / 过滤等操作。
 *
 * @param allowed 当前用户是否具备 SYSTEM_ADMIN 权限；为 false 时不发起任何请求。
 */
export function useAiMonitorData(allowed: boolean) {
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null)
  const [todayItems, setTodayItems] = useState<AiLogItem[]>([])
  const [logs, setLogs] = useState<AiLogItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  // Phase 6 Task 39.3: promptHash 筛选
  const [promptHashFilter, setPromptHashFilter] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [error, setError] = useState('')
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null)
  const [cancellingLogId, setCancellingLogId] = useState<string | null>(null)
  // Phase 6 Task 35.3: AI 成本聚合数据
  const [aiCost, setAiCost] = useState<AiCostData | null>(null)

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetchWithCookie('/api/admin/ai/queue-status')
      const data = await res.json()
      if (data.success) setQueueStatus(data.data as QueueStatusResponse)
    } catch (err) {
      logger.error('获取队列状态失败', err)
    }
  }, [])

  const fetchTodayAggregate = useCallback(async () => {
    try {
      const res = await fetchWithCookie('/api/admin/ai/logs?page=1&pageSize=100')
      const data = await res.json()
      if (data.success) {
        const items: AiLogItem[] = data.data?.items ?? []
        setTodayItems(items.filter((it) => isToday(it.createdAt)))
      }
    } catch (err) {
      logger.error('获取今日聚合失败', err)
    }
  }, [])

  // Phase 6 Task 35.3: 拉取 AI 成本聚合（来自 /api/admin/dashboard）
  const fetchAiCost = useCallback(async () => {
    try {
      const res = await fetchWithCookie('/api/admin/dashboard')
      const data = await res.json()
      if (data.success && data.data?.aiCost) {
        setAiCost(data.data.aiCost as AiCostData)
      }
    } catch (err) {
      logger.error('获取 AI 成本聚合失败', err)
    }
  }, [])

  const fetchLogs = useCallback(async (p: number, status: string, hashFilter: string, silent: boolean) => {
    if (!silent) setLoadingLogs(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
      })
      if (status) params.set('status', status)
      // Phase 6 Task 39.3: 后端暂未支持 promptHash 查询参数，前端兜底过滤
      const res = await fetchWithCookie(`/api/admin/ai/logs?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        const payload = data.data as LogsResponse
        let items = payload?.items ?? []
        // Phase 6 Task 39.3: 前端按 promptHash 过滤（如后端未实现）
        if (hashFilter) {
          const lower = hashFilter.toLowerCase()
          items = items.filter((it) => {
            const h = it.params?.promptHash
            return h && h.toLowerCase().includes(lower)
          })
        }
        setLogs(items)
        setTotalCount(hashFilter ? items.length : (payload?.totalCount ?? 0))
      } else {
        setLogs([])
        setTotalCount(0)
        setError(data.error || '加载失败')
      }
    } catch (err) {
      logger.error('获取任务列表失败', err)
      setLogs([])
      setTotalCount(0)
      setError('网络错误')
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  // 初始加载 + 分页/过滤变化时拉取（非静默，展示 loading）
  useEffect(() => {
    if (!allowed) return
    fetchLogs(page, statusFilter, promptHashFilter, false)
  }, [allowed, page, statusFilter, promptHashFilter, fetchLogs])

  // 队列状态轮询：每 3 秒
  useEffect(() => {
    if (!allowed) return
    fetchQueueStatus()
    const id = setInterval(fetchQueueStatus, 3000)
    return () => clearInterval(id)
  }, [allowed, fetchQueueStatus])

  // 今日聚合轮询：每 10 秒
  useEffect(() => {
    if (!allowed) return
    fetchTodayAggregate()
    const id = setInterval(fetchTodayAggregate, 10000)
    return () => clearInterval(id)
  }, [allowed, fetchTodayAggregate])

  // Phase 6 Task 35.3: AI 成本轮询（每 30 秒，成本变化频率较低）
  useEffect(() => {
    if (!allowed) return
    fetchAiCost()
    const id = setInterval(fetchAiCost, 30000)
    return () => clearInterval(id)
  }, [allowed, fetchAiCost])

  // 任务列表轮询：每 5 秒（静默刷新当前页）
  useEffect(() => {
    if (!allowed) return
    const id = setInterval(() => fetchLogs(page, statusFilter, promptHashFilter, true), 5000)
    return () => clearInterval(id)
  }, [allowed, fetchLogs, page, statusFilter, promptHashFilter])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleStatusChange = (v: string) => {
    setStatusFilter(v)
    setPage(1)
  }

  // Phase 6 Task 39.3: promptHash 筛选变化
  const handlePromptHashChange = (v: string) => {
    setPromptHashFilter(v.trim())
    setPage(1)
  }

  const refreshLogs = () => fetchLogs(page, statusFilter, promptHashFilter, false)

  // 重试失败任务：调 POST /api/admin/ai/generate body={ retryFromLogId }
  const handleRetry = async (logId: string) => {
    setRetryingLogId(logId)
    setError('')
    try {
      const res = await fetchWithCookie('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryFromLogId: logId }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchLogs(page, statusFilter, promptHashFilter, true)
      } else {
        setError(data.error || '重试失败')
      }
    } catch (err) {
      logger.error('重试任务失败', err)
      setError('网络错误')
    } finally {
      setRetryingLogId(null)
    }
  }

  // 取消 PENDING 任务：调 POST /api/admin/ai/cancel body={ logId }
  const handleCancel = async (logId: string) => {
    setCancellingLogId(logId)
    setError('')
    try {
      const res = await fetchWithCookie('/api/admin/ai/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchLogs(page, statusFilter, promptHashFilter, true)
      } else {
        setError(data.error || '取消失败')
      }
    } catch (err) {
      logger.error('取消任务失败', err)
      setError('网络错误')
    } finally {
      setCancellingLogId(null)
    }
  }

  // 今日聚合统计（前端按 createdAt 过滤到今日）
  const { counts: todayCounts, tokens: todayTokens } = useMemo(
    () => computeTodayCounts(todayItems),
    [todayItems],
  )

  const taskChains = useMemo(() => groupTaskChains(logs), [logs])

  return {
    queueStatus,
    todayCounts,
    todayTokens,
    logs,
    totalCount,
    page,
    totalPages,
    statusFilter,
    promptHashFilter,
    loadingLogs,
    error,
    retryingLogId,
    cancellingLogId,
    aiCost,
    taskChains,
    setPage,
    handleStatusChange,
    handlePromptHashChange,
    handleRetry,
    handleCancel,
    refreshLogs,
  }
}
