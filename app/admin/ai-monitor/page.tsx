'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { fetchWithAuth } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { isSystemAdmin } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCw,
  XCircle,
  Zap,
  DollarSign,
  Network,
  List,
  Hash,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface QueueStatus {
  waiting: number
  active: number
  maxConcurrent: number
}

interface QueueStatusResponse {
  problemQueue: QueueStatus
  solutionQueue: QueueStatus
}

interface AiLogItem {
  id: string
  userId: string
  status: string
  params: {
    modelId?: string
    problemId?: string
    targetProblemId?: string
    mode?: string
    /** Phase 6 Task 36: 父任务 ID（任务链） */
    parentLogId?: string
    /** Phase 6 Task 39: prompt 版本哈希 */
    promptHash?: string
    /** Phase 6 Task 29: 批次 ID */
    batchId?: string
  } | null
  result: unknown
  error: string | null
  tokensUsed: number
  /** Phase 6 Task 35: 预估成本 */
  estimatedCost?: number | null
  createdAt: string
  updatedAt: string
  user: { username: string }
}

interface LogsResponse {
  items: AiLogItem[]
  totalCount: number
}

/** Phase 6 Task 35.3: AI 成本聚合（来自 /api/admin/dashboard） */
interface AiCostData {
  todayCost: number
  monthCost: number
  todayTaskCount: number
  monthTaskCount: number
}

const PAGE_SIZE = 20

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'PROCESSING', label: 'PROCESSING' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'FAILED', label: 'FAILED' },
]

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m${rem}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

function extractModel(item: AiLogItem): string {
  return item.params?.modelId || '-'
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'PENDING':
      return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">PENDING</span>
    case 'PROCESSING':
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          PROCESSING
        </span>
      )
    case 'COMPLETED':
      return <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary">COMPLETED</span>
    case 'FAILED':
      return <span className="px-2 py-0.5 rounded text-xs bg-error/10 text-error">FAILED</span>
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{status}</span>
  }
}

function UtilizationBar({ active, max }: { active: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (active / max) * 100) : 0
  const colorClass = pct >= 90 ? 'bg-error' : pct >= 50 ? 'bg-warning' : 'bg-success'
  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full ${colorClass} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function QueueCard({ title, status }: { title: string; status: QueueStatus | null }) {
  const active = status?.active ?? 0
  const max = status?.maxConcurrent ?? 0
  const waiting = status?.waiting ?? 0
  const pct = max > 0 ? Math.round((active / max) * 100) : 0
  const tagClass = pct >= 90 ? 'tag-error' : pct >= 50 ? 'tag-warning' : 'tag-success'
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <span className={`tag ${tagClass}`}>{pct}%</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">等待</p>
          <p className="text-2xl font-bold text-foreground">{waiting}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">运行</p>
          <p className="text-2xl font-bold text-foreground">{active}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">上限</p>
          <p className="text-2xl font-bold text-foreground">{max}</p>
        </div>
      </div>
      <UtilizationBar active={active} max={max} />
    </div>
  )
}

export default function AiMonitorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useUser()

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
  // Phase 6 Task 36.2: 视图切换（列表 / 任务链图）
  const [viewMode, setViewMode] = useState<'list' | 'chain'>('list')
  // Phase 6 Task 36.4: focus 查询参数（点击任务链节点跳转到列表视图并高亮某行）
  const focusedLogId = searchParams?.get('focus') || ''
  const rowRefs = useRef<Map<string, HTMLTableRowElement | HTMLDivElement>>(new Map())

  const allowed = isSystemAdmin(user)

  // 权限校验：非 SYSTEM_ADMIN 重定向到 /admin
  useEffect(() => {
    if (isLoading) return
    if (!isSystemAdmin(user)) {
      router.push('/admin')
    }
  }, [user, isLoading, router])

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/admin/ai/queue-status')
      const data = await res.json()
      if (data.success) setQueueStatus(data.data as QueueStatusResponse)
    } catch (err) {
      logger.error('获取队列状态失败', err)
    }
  }, [])

  const fetchTodayAggregate = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/admin/ai/logs?page=1&pageSize=100')
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
      const res = await fetchWithAuth('/api/admin/dashboard')
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
      const res = await fetchWithAuth(`/api/admin/ai/logs?${params.toString()}`)
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

  // Phase 6 Task 36.4: focus 查询参数变化时，切换到列表视图并滚动到目标行
  useEffect(() => {
    if (!allowed || !focusedLogId) return
    // 自动切换到列表视图以显示该任务行
    if (viewMode !== 'list') setViewMode('list')
    // 等数据 + 渲染完成后滚动
    const timer = setTimeout(() => {
      const el = rowRefs.current.get(focusedLogId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-primary')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary')
        }, 2500)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [allowed, focusedLogId, logs, viewMode])

  // Phase 6 Task 36.4: 点击任务链节点跳转任务详情（同页滚动到列表视图对应行）
  const handleFocusTask = (logId: string) => {
    // 切换 URL 查询参数以触发 useEffect
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('focus', logId)
    router.replace(`/admin/ai-monitor?${params.toString()}`)
    if (viewMode !== 'list') setViewMode('list')
  }

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

  // 重试失败任务：调 POST /api/admin/ai/generate body={ retryFromLogId }
  const handleRetry = async (logId: string) => {
    setRetryingLogId(logId)
    setError('')
    try {
      const res = await fetchWithAuth('/api/admin/ai/generate', {
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
      const res = await fetchWithAuth('/api/admin/ai/cancel', {
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
  const todayCounts: Record<string, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  }
  let todayTokens = 0
  for (const it of todayItems) {
    if (todayCounts[it.status] !== undefined) todayCounts[it.status]++
    todayTokens += it.tokensUsed || 0
  }

  /**
   * Phase 6 Task 36.3: 任务链分组（基于 parentLogId）
   *
   * 返回一个数组，每项是一条任务链：
   * - chains: 从根任务（无 parentLogId 或 parent 不在当前页）出发的后代链
   * - orphans: 既不是根、也不是任何链中任务的"孤儿"（理论上不应出现，但兜底处理）
   *
   * 链内顺序：root → child → grandchild → ...
   */
  const taskChains = useMemo(() => {
    const byId = new Map<string, AiLogItem>()
    for (const it of logs) byId.set(it.id, it)

    // 标记哪些任务已在某条链中
    const visited = new Set<string>()
    const chains: AiLogItem[][] = []

    // 先从有 parentLogId 的任务向上找根
    const roots: AiLogItem[] = []
    for (const it of logs) {
      const parentId = it.params?.parentLogId
      if (!parentId || !byId.has(parentId)) {
        // 当前任务本身是根（或父任务不在当前页）
        roots.push(it)
      }
    }

    // 去重 roots（同一任务不应出现两次）
    const seenRoot = new Set<string>()
    for (const root of roots) {
      if (seenRoot.has(root.id)) continue
      seenRoot.add(root.id)

      // BFS 向下找所有后代
      const chain: AiLogItem[] = [root]
      visited.add(root.id)
      let frontier: string[] = [root.id]
      while (frontier.length > 0) {
        const next: string[] = []
        for (const it of logs) {
          if (visited.has(it.id)) continue
          const parentId = it.params?.parentLogId
          if (parentId && frontier.includes(parentId)) {
            chain.push(it)
            visited.add(it.id)
            next.push(it.id)
          }
        }
        frontier = next
      }
      chains.push(chain)
    }

    // 兜底：未访问过的任务（理论上不应出现）
    const orphans = logs.filter((it) => !visited.has(it.id))

    return { chains, orphans }
  }, [logs])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-error mx-auto mb-3" />
          <p className="text-error text-lg mb-1">无权限访问</p>
          <p className="text-muted-foreground text-sm">正在跳转...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 第一行：两个队列状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QueueCard title="题目生成队列" status={queueStatus?.problemQueue ?? null} />
        <QueueCard title="题解生成队列" status={queueStatus?.solutionQueue ?? null} />
      </div>

      {/* 第二行：今日聚合指标 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-5">
          <p className="text-xs text-muted-foreground mb-1">今日等待</p>
          <p className="text-2xl font-bold text-foreground">{todayCounts.PENDING}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-muted-foreground mb-1">今日处理中</p>
          <p className="text-2xl font-bold text-info">{todayCounts.PROCESSING}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-muted-foreground mb-1">今日完成</p>
          <p className="text-2xl font-bold text-secondary">{todayCounts.COMPLETED}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-muted-foreground mb-1">今日失败</p>
          <p className="text-2xl font-bold text-error">{todayCounts.FAILED}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-warning" />
            <p className="text-xs text-muted-foreground">今日 Token</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{todayTokens.toLocaleString()}</p>
        </div>
      </div>

      {/* Phase 6 Task 35.3: AI 成本卡片行（今日 / 本月） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-success" />
              <p className="text-xs text-muted-foreground">今日 AI 成本</p>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {aiCost?.todayTaskCount ?? todayCounts.PENDING + todayCounts.PROCESSING + todayCounts.COMPLETED + todayCounts.FAILED} 个任务
            </span>
          </div>
          <p className="text-2xl font-bold text-success">
            ¥{(aiCost?.todayCost ?? 0).toFixed(6)}
          </p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">本月累计成本</p>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {aiCost?.monthTaskCount ?? '-'} 个任务
            </span>
          </div>
          <p className="text-2xl font-bold text-primary">
            ¥{(aiCost?.monthCost ?? 0).toFixed(6)}
          </p>
        </div>
      </div>

      {/* 第三行：全局任务列表 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">全局任务列表</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Phase 6 Task 39.3: promptHash 筛选输入 */}
            <div className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={promptHashFilter}
                onChange={(e) => handlePromptHashChange(e.target.value)}
                placeholder="promptHash 过滤"
                className="input w-40 text-xs"
                title="按 prompt 版本哈希过滤任务（支持前缀匹配）"
              />
            </div>
            <label className="text-sm text-muted-foreground">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="input w-auto"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {/* Phase 6 Task 36.2: 视图切换（列表 / 任务链图） */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                  viewMode === 'list' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
                title="列表视图"
              >
                <List className="w-3.5 h-3.5" />
                列表
              </button>
              <button
                onClick={() => setViewMode('chain')}
                className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                  viewMode === 'chain' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
                title="任务链视图：按 parentLogId 关联展示 A → B 依赖关系"
              >
                <Network className="w-3.5 h-3.5" />
                任务链
              </button>
            </div>
            <button
              onClick={() => fetchLogs(page, statusFilter, promptHashFilter, false)}
              className="btn btn-ghost text-sm flex items-center gap-1"
              title="刷新当前页"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>暂无任务记录</p>
          </div>
        ) : (
          <>
            {viewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 px-2 font-medium">用户名</th>
                      <th className="py-2 px-2 font-medium">状态</th>
                      <th className="py-2 px-2 font-medium">模型</th>
                      <th className="py-2 px-2 font-medium">耗时</th>
                      <th className="py-2 px-2 font-medium">Token</th>
                      <th className="py-2 px-2 font-medium">成本</th>
                      <th className="py-2 px-2 font-medium">创建时间</th>
                      <th className="py-2 px-2 font-medium">错误</th>
                      <th className="py-2 px-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((it) => (
                      <tr
                        key={it.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(it.id, el)
                          else rowRefs.current.delete(it.id)
                        }}
                        className={`border-b border-border/50 hover:bg-muted/30 ${focusedLogId === it.id ? 'ring-2 ring-primary' : ''}`}
                      >
                        <td className="py-2 px-2 text-foreground">{it.user?.username || '-'}</td>
                        <td className="py-2 px-2"><StatusBadge status={it.status} /></td>
                        <td className="py-2 px-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            {extractModel(it)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(it.createdAt, it.updatedAt)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{(it.tokensUsed || 0).toLocaleString()}</td>
                        {/* Phase 6 Task 35.3: 成本列 */}
                        <td className="py-2 px-2 text-muted-foreground text-xs">
                          {it.estimatedCost != null ? `¥${Number(it.estimatedCost).toFixed(6)}` : '-'}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(it.createdAt)}
                        </td>
                        <td className="py-2 px-2 text-error text-xs max-w-xs truncate" title={it.error || ''}>
                          {it.error || '-'}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            {(() => {
                              const pid = it.params?.problemId || it.params?.targetProblemId
                              return pid ? (
                                <Link
                                  href={`/admin/problems/${pid}/edit`}
                                  className="p-1 rounded hover:bg-muted text-primary transition-colors"
                                  title="跳转关联题目"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </Link>
                              ) : null
                            })()}
                            {it.status === 'FAILED' && (
                              <button
                                onClick={() => handleRetry(it.id)}
                                disabled={retryingLogId === it.id}
                                className="p-1 rounded hover:bg-muted text-warning disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="重试"
                              >
                                {retryingLogId === it.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCw className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            {it.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancel(it.id)}
                                disabled={cancellingLogId === it.id}
                                className="p-1 rounded hover:bg-muted text-error disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="取消"
                              >
                                {cancellingLogId === it.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ChainGraphView
                chains={taskChains.chains}
                orphans={taskChains.orphans}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onFocusTask={handleFocusTask}
                retryingLogId={retryingLogId}
                cancellingLogId={cancellingLogId}
              />
            )}

            {/* 分页（仅列表视图显示） */}
            {viewMode === 'list' && (
              <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  共 {totalCount} 条，第 {page} 页 / 共 {totalPages} 页
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-outline btn-sm flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn btn-outline btn-sm flex items-center gap-1"
                  >
                    下一页
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 任务链视图说明 */}
            {viewMode === 'chain' && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Network className="w-3 h-3" />
                显示当前页 {logs.length} 条任务，按 parentLogId 关联成 {taskChains.chains.length} 条任务链
                {taskChains.orphans.length > 0 && ` · ${taskChains.orphans.length} 条孤儿任务`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Phase 6 Task 36.3 / 36.4: 任务链图视图
 *
 * 渲染有向链：root → child → grandchild → ...
 * - 成功节点（COMPLETED）：绿色边框
 * - 失败节点（FAILED）：红色边框
 * - 进行中节点（PROCESSING）：蓝色边框 + 旋转图标
 * - 待处理节点（PENDING）：灰色边框
 * - 点击节点跳转关联题目（如 params.problemId 存在）
 * - Phase 6 Task 36.4：点击节点详情按钮跳转列表视图对应行（?focus=xxx）
 */
function ChainGraphView({
  chains,
  orphans,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: {
  chains: AiLogItem[][]
  orphans: AiLogItem[]
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}) {
  if (chains.length === 0 && orphans.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>暂无任务链</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {chains.map((chain, idx) => (
        <ChainRow
          key={`chain-${idx}`}
          chain={chain}
          onRetry={onRetry}
          onCancel={onCancel}
          onFocusTask={onFocusTask}
          retryingLogId={retryingLogId}
          cancellingLogId={cancellingLogId}
        />
      ))}

      {orphans.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            孤儿任务（无父任务关联，{orphans.length} 条）
          </p>
          <div className="flex flex-wrap gap-2">
            {orphans.map((it) => (
              <ChainNode
                key={it.id}
                item={it}
                onRetry={onRetry}
                onCancel={onCancel}
                onFocusTask={onFocusTask}
                retryingLogId={retryingLogId}
                cancellingLogId={cancellingLogId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChainRow({
  chain,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: {
  chain: AiLogItem[]
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
        <Network className="w-3 h-3" />
        <span>任务链（{chain.length} 个节点）</span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto custom-scrollbar pb-2">
        {chain.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 flex-shrink-0">
            <ChainNode
              item={item}
              onRetry={onRetry}
              onCancel={onCancel}
              onFocusTask={onFocusTask}
              retryingLogId={retryingLogId}
              cancellingLogId={cancellingLogId}
            />
            {idx < chain.length - 1 && (
              <div className="flex items-center text-muted-foreground" aria-hidden="true">
                <span className="text-lg">→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChainNode({
  item,
  onRetry,
  onCancel,
  onFocusTask,
  retryingLogId,
  cancellingLogId,
}: {
  item: AiLogItem
  onRetry: (logId: string) => void
  onCancel: (logId: string) => void
  onFocusTask: (logId: string) => void
  retryingLogId: string | null
  cancellingLogId: string | null
}) {
  const status = item.status
  const borderClass =
    status === 'COMPLETED' ? 'border-success/60 bg-success/5'
    : status === 'FAILED' ? 'border-error/60 bg-error/5'
    : status === 'PROCESSING' ? 'border-info/60 bg-info/5'
    : 'border-border bg-muted'

  const pid = item.params?.problemId || item.params?.targetProblemId

  return (
    <div className={`rounded-lg border-2 ${borderClass} p-2.5 min-w-[180px] max-w-[240px]`}>
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <StatusBadge status={status} />
        <span className="text-[10px] text-muted-foreground font-mono" title={item.id}>
          #{item.id.slice(-6)}
        </span>
      </div>
      <p className="text-xs text-foreground font-medium mb-1 truncate">
        {item.user?.username || '未知用户'}
      </p>
      <p className="text-[10px] text-muted-foreground mb-1 truncate">
        模式：{item.params?.mode || '-'}
      </p>
      <p className="text-[10px] text-muted-foreground mb-1.5">
        耗时：{formatDuration(item.createdAt, item.updatedAt)}
        · Token：{(item.tokensUsed || 0).toLocaleString()}
      </p>
      {item.estimatedCost != null && (
        <p className="text-[10px] text-success mb-1.5">
          成本：¥{Number(item.estimatedCost).toFixed(6)}
        </p>
      )}
      {item.error && (
        <p className="text-[10px] text-error mb-1.5 line-clamp-2" title={item.error}>
          {item.error}
        </p>
      )}
      <div className="flex items-center gap-1">
        {/* Phase 6 Task 36.4：点击节点详情按钮跳转列表视图对应行 */}
        <button
          onClick={() => onFocusTask(item.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="在列表视图中定位此任务"
        >
          <ListChecks className="w-3 h-3" />
        </button>
        {pid && (
          <Link
            href={`/admin/problems/${pid}/edit`}
            className="p-1 rounded hover:bg-muted text-primary transition-colors"
            title="跳转关联题目"
          >
            <FileText className="w-3 h-3" />
          </Link>
        )}
        {status === 'FAILED' && (
          <button
            onClick={() => onRetry(item.id)}
            disabled={retryingLogId === item.id}
            className="p-1 rounded hover:bg-muted text-warning disabled:opacity-50 transition-colors"
            title="重试"
          >
            {retryingLogId === item.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
          </button>
        )}
        {status === 'PENDING' && (
          <button
            onClick={() => onCancel(item.id)}
            disabled={cancellingLogId === item.id}
            className="p-1 rounded hover:bg-muted text-error disabled:opacity-50 transition-colors"
            title="取消"
          >
            {cancellingLogId === item.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
