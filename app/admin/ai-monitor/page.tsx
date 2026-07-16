'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { isSystemAdmin } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Layers,
  ListChecks,
  Loader2,
  RefreshCw,
  Zap,
} from 'lucide-react'

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
  params: { modelId?: string } | null
  result: unknown
  error: string | null
  tokensUsed: number
  createdAt: string
  updatedAt: string
  user: { username: string }
}

interface LogsResponse {
  items: AiLogItem[]
  totalCount: number
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
  const { user, isLoading } = useUser()

  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null)
  const [todayItems, setTodayItems] = useState<AiLogItem[]>([])
  const [logs, setLogs] = useState<AiLogItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [error, setError] = useState('')

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

  const fetchLogs = useCallback(async (p: number, status: string, silent: boolean) => {
    if (!silent) setLoadingLogs(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
      })
      if (status) params.set('status', status)
      const res = await fetchWithAuth(`/api/admin/ai/logs?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        const payload = data.data as LogsResponse
        setLogs(payload?.items ?? [])
        setTotalCount(payload?.totalCount ?? 0)
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
    fetchLogs(page, statusFilter, false)
  }, [allowed, page, statusFilter, fetchLogs])

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

  // 任务列表轮询：每 5 秒（静默刷新当前页）
  useEffect(() => {
    if (!allowed) return
    const id = setInterval(() => fetchLogs(page, statusFilter, true), 5000)
    return () => clearInterval(id)
  }, [allowed, fetchLogs, page, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleStatusChange = (v: string) => {
    setStatusFilter(v)
    setPage(1)
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
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}
        >
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI 监控</h1>
          <p className="text-sm text-muted-foreground">AI 任务队列状态与生成日志全局视图</p>
        </div>
      </div>

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

      {/* 第三行：全局任务列表 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">全局任务列表</h3>
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => fetchLogs(page, statusFilter, false)}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 px-2 font-medium">用户名</th>
                    <th className="py-2 px-2 font-medium">状态</th>
                    <th className="py-2 px-2 font-medium">模型</th>
                    <th className="py-2 px-2 font-medium">耗时</th>
                    <th className="py-2 px-2 font-medium">Token</th>
                    <th className="py-2 px-2 font-medium">创建时间</th>
                    <th className="py-2 px-2 font-medium">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((it) => (
                    <tr key={it.id} className="border-b border-border/50 hover:bg-muted/30">
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
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                        {new Date(it.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 px-2 text-error text-xs max-w-xs truncate" title={it.error || ''}>
                        {it.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
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
          </>
        )}
      </div>
    </div>
  )
}
