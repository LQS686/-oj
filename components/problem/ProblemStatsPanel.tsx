'use client'

/**
 * 题目统计面板（参考 HOJ ProblemStatistics.vue + Hydro OJ 题目统计）
 *
 * 数据来源：/api/problems/[id]/stats
 *
 * 展示内容：
 *   1. 顶部 5 项指标卡（总提交 / AC 数 / AC 率 / 平均耗时 / 平均内存）
 *   2. 状态分布（水平进度条，含状态名称、数量、占比）
 *   3. 语言分布（水平进度条，同上）
 *   4. 近 7 天提交趋势（recharts AreaChart，区分总提交与 AC 数）
 *
 * 设计要点：
 *   - 与项目色彩语义一致：AC=secondary（绿）、WA=error（红）、TLE=warning（橙）、其他=muted
 *   - 统计数字使用 font-mono tabular-nums 保持等宽对齐
 *   - 加载/错误/空态都做了处理
 */
import { useEffect, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  Timer,
  MemoryStick,
  CheckCircle2,
  Send,
  AlertCircle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { fetchWithCookie } from '@/lib/api/base'

interface ProblemStats {
  statusCounts: Record<string, number>
  languageCounts: Record<string, number>
  totalSubmissions: number
  acCount: number
  acRate: number
  recentTrend: Array<{ date: string; count: number; acCount: number }>
  avgTimeMs: number
  avgMemoryKb: number
}

// 状态显示配置：颜色、显示名、排序优先级
// 颜色与项目色彩语义保持一致（lib/status.ts）
const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; textClass: string; order: number }> = {
  AC:          { label: 'Accepted',           color: '#10b981', bgClass: 'bg-secondary',    textClass: 'text-secondary-light',    order: 1 },
  WA:          { label: 'Wrong Answer',       color: '#ef4444', bgClass: 'bg-error',       textClass: 'text-error',              order: 2 },
  TLE:         { label: 'Time Limit Exceeded',color: '#f59e0b', bgClass: 'bg-warning',     textClass: 'text-warning',            order: 3 },
  MLE:         { label: 'Memory Limit Exceeded',color:'#f59e0b',bgClass: 'bg-warning',     textClass: 'text-warning',            order: 4 },
  RE:          { label: 'Runtime Error',      color: '#a855f7', bgClass: 'bg-accent',      textClass: 'text-accent-light',       order: 5 },
  CE:          { label: 'Compile Error',      color: '#6b7280', bgClass: 'bg-muted',       textClass: 'text-muted-foreground',   order: 6 },
  Pending:     { label: 'Pending',            color: '#6b7280', bgClass: 'bg-muted',       textClass: 'text-muted-foreground',   order: 7 },
  Judging:     { label: 'Judging',            color: '#6b7280', bgClass: 'bg-muted',       textClass: 'text-muted-foreground',   order: 8 },
  Running:     { label: 'Running',            color: '#6b7280', bgClass: 'bg-muted',       textClass: 'text-muted-foreground',   order: 9 },
}

// 语言显示配置
const LANGUAGE_CONFIG: Record<string, { label: string; color: string }> = {
  cpp:    { label: 'C++',     color: '#818cf8' },
  c:      { label: 'C',       color: '#06b6d4' },
  python: { label: 'Python',  color: '#f59e0b' },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || { label: status, color: '#6b7280', bgClass: 'bg-muted', textClass: 'text-muted-foreground', order: 99 }
}

function getLanguageConfig(lang: string) {
  return LANGUAGE_CONFIG[lang] || { label: lang, color: '#6b7280' }
}

function formatMemory(kb: number): string {
  if (kb <= 0) return '-'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

function formatTime(ms: number): string {
  if (ms <= 0) return '-'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export default function ProblemStatsPanel({ problemId }: { problemId: string }) {
  const [stats, setStats] = useState<ProblemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetchWithCookie(`/api/problems/${problemId}/stats`)
        const data = await res.json()
        if (cancelled) return
        if (data.success) {
          setStats(data.data)
        } else {
          setError(data.error || '加载统计失败')
        }
      } catch (err) {
        if (cancelled) return
        setError('网络错误')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchStats()
    return () => { cancelled = true }
  }, [problemId])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card-static p-4 rounded-lg">
              <div className="skeleton h-8 w-16 mb-2 rounded"></div>
              <div className="skeleton h-3 w-12 rounded"></div>
            </div>
          ))}
        </div>
        <div className="skeleton h-48 w-full rounded-lg"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-lg bg-error/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-error" />
        </div>
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!stats || stats.totalSubmissions === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-lg bg-muted/30 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">暂无提交数据</p>
        <p className="text-xs text-muted-foreground mt-1">成为第一个提交此题的人</p>
      </div>
    )
  }

  // 状态分布排序：按 STATUS_CONFIG.order 升序，数量降序
  const statusEntries = Object.entries(stats.statusCounts)
    .map(([status, count]) => ({ status, count, ...getStatusConfig(status) }))
    .sort((a, b) => a.order - b.order || b.count - a.count)

  // 语言分布排序：按数量降序
  const languageEntries = Object.entries(stats.languageCounts)
    .map(([lang, count]) => ({ lang, count, ...getLanguageConfig(lang) }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      {/* 顶部指标卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card-static p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Send className="w-3.5 h-3.5" />
            <span>总提交</span>
          </div>
          <div className="text-2xl font-bold text-foreground font-mono tabular-nums">
            {stats.totalSubmissions}
          </div>
        </div>
        <div className="card-static p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>AC 数</span>
          </div>
          <div className="text-2xl font-bold text-secondary-light font-mono tabular-nums">
            {stats.acCount}
          </div>
        </div>
        <div className="card-static p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>AC 率</span>
          </div>
          <div className="text-2xl font-bold text-primary-light font-mono tabular-nums">
            {stats.acRate}%
          </div>
        </div>
        <div className="card-static p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Timer className="w-3.5 h-3.5" />
            <span>AC 平均耗时</span>
          </div>
          <div className="text-2xl font-bold text-foreground font-mono tabular-nums">
            {formatTime(stats.avgTimeMs)}
          </div>
        </div>
        <div className="card-static p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <MemoryStick className="w-3.5 h-3.5" />
            <span>AC 平均内存</span>
          </div>
          <div className="text-2xl font-bold text-foreground font-mono tabular-nums">
            {formatMemory(stats.avgMemoryKb)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 状态分布 */}
        <div className="card-static p-5 rounded-lg">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-light" />
            状态分布
          </h4>
          <div className="space-y-3">
            {statusEntries.map(({ status, count, label, bgClass, textClass }) => {
              const pct = stats.totalSubmissions > 0 ? (count / stats.totalSubmissions) * 100 : 0
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className={`font-medium ${textClass}`}>{label}</span>
                    <span className="text-muted-foreground font-mono tabular-nums">
                      {count} <span className="opacity-60">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div
                      className={`${bgClass} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 语言分布 */}
        <div className="card-static p-5 rounded-lg">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-light" />
            语言分布
          </h4>
          {languageEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          ) : (
            <div className="space-y-3">
              {languageEntries.map(({ lang, count, label, color }) => {
                const pct = stats.totalSubmissions > 0 ? (count / stats.totalSubmissions) * 100 : 0
                return (
                  <div key={lang}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-foreground">{label}</span>
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {count} <span className="opacity-60">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 近 7 天提交趋势 */}
      <div className="card-static p-5 rounded-lg">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary-light" />
          近 7 天提交趋势
        </h4>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.recentTrend}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} stroke="#94A3B8" fontSize={12} />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} stroke="#94A3B8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.4)',
                  backgroundColor: 'rgba(15, 23, 42, 0.98)',
                  backdropFilter: 'blur(24px)',
                  color: '#F8FAFC',
                  padding: '8px 12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                type="monotone"
                dataKey="count"
                name="总提交"
                stroke="#818cf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTotal)"
              />
              <Area
                type="monotone"
                dataKey="acCount"
                name="AC"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAc)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
