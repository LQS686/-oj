'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Calendar,
  Code,
  Target,
  TrendingUp,
  AlertCircle,
  Flame,
  Settings,
  ExternalLink,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type {
  User as UserType,
  ActivityData,
  RecentSubmission,
  DifficultyDistribution,
} from '@/types/models'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { fetchWithCookie } from '@/lib/api/base'
import { formatDate } from '@/lib/utils'
import SubmissionHeatmap from '@/components/user/SubmissionHeatmap'
import { EducationalPageShell, PageLoading } from '@/components/common'
import { useUser } from '@/contexts/UserContext'
import { getRoleLabel, getRoleColor } from '@/lib/permissions'
import { isAcceptedStatus } from '@/lib/constants/submission-status'

function difficultyBarClass(diff: string): string {
  if (diff.includes('入门')) return 'bg-success'
  if (diff.includes('普及')) return 'bg-warning'
  if (diff.includes('提高') || diff.includes('省选') || diff.includes('NOI')) return 'bg-error'
  return 'bg-primary'
}

function statusTagClass(status: string): string {
  if (isAcceptedStatus(status)) return 'tag-success'
  if (status === 'WA') return 'tag-error'
  if (status === 'TLE') return 'tag-warning'
  return 'tag'
}

export default function UserProfilePage() {
  const params = useParams()
  const id = params.id as string
  const { user: me } = useUser()

  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityData, setActivityData] = useState<ActivityData[]>([])
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])
  const [difficultyDistribution, setDifficultyDistribution] = useState<DifficultyDistribution[]>(
    []
  )
  const [yearActivity, setYearActivity] = useState<Record<string, number>>({})

  const isOwn = !!me && me.id === id

  useDocumentTitle(user ? `${user.nickname || user.username} - 用户主页` : undefined)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [infoRes, statsRes] = await Promise.all([
          fetchWithCookie(`/api/users/${id}/info`),
          fetchWithCookie(`/api/users/${id}/stats`),
        ])
        const infoData = await infoRes.json()
        const statsData = await statsRes.json()

        if (cancelled) return

        if (!infoData.success) {
          setError(infoData.error || '用户不存在')
          setUser(null)
          return
        }
        setUser(infoData.data)

        if (statsData.success) {
          const heatmapData = statsData.data.activity?.lastWeek || {}
          const chartData = Object.entries(heatmapData).map(([date, count]) => ({
            date,
            count: Number(count),
          }))
          const filled: ActivityData[] = []
          const today = new Date()
          for (let i = 6; i >= 0; i--) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const dateStr = d.toISOString().split('T')[0]
            const found = chartData.find((item) => item.date === dateStr)
            filled.push({
              date: dateStr.slice(5).replace('-', '/'),
              count: found ? found.count : 0,
            })
          }
          setActivityData(filled)
          setRecentSubmissions(statsData.data.recentSubmissions || [])
          setDifficultyDistribution(statsData.data.difficultyDistribution || [])
          setYearActivity(statsData.data.activity?.lastYear || {})
        }
      } catch {
        if (!cancelled) setError('加载用户信息失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const weekTotal = useMemo(
    () => activityData.reduce((sum, d) => sum + (d.count || 0), 0),
    [activityData]
  )

  if (loading) {
    return <PageLoading label="加载用户信息…" />
  }

  if (error || !user) {
    return (
      <EducationalPageShell title="用户主页" width="standard">
        <div className="card-static rounded-xl p-10 text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-error" />
          </div>
          <h1 className="text-lg font-bold text-foreground mb-2">无法访问用户主页</h1>
          <p className="text-muted-foreground text-sm">{error || '用户不存在'}</p>
        </div>
      </EducationalPageShell>
    )
  }

  const solved = user.acceptedSubmissions || user.solvedCount || 0
  const submits = user._count?.submissions || 0
  const passRate = submits > 0 ? ((solved / submits) * 100).toFixed(1) : '0'
  const accent = user.color || 'var(--primary)'
  const displayName = user.nickname || user.username

  return (
    <EducationalPageShell title={displayName} width="default">
      <div className="space-y-4">
        {/* 身份头图 */}
        <section className="card-static rounded-xl p-5 md:p-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-start">
            <div
              className="w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center text-white text-2xl font-bold overflow-hidden border border-border"
              style={{ backgroundColor: user.color || undefined }}
            >
              {user.avatar ? (
                <img src={user.avatar} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                (user.username?.charAt(0) || '?').toUpperCase()
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
                <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
                  {displayName}
                </h1>
                {user.role && (
                  <span className={`tag text-xs ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                )}
                {user.rank && (
                  <span
                    className="tag text-xs font-medium"
                    style={{
                      backgroundColor: `${accent}18`,
                      color: accent,
                      borderColor: `${accent}40`,
                    }}
                  >
                    {user.rank}
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground font-mono mt-1">@{user.username}</p>

              {user.bio?.trim() ? (
                <p className="text-sm text-foreground/80 mt-3 leading-relaxed max-w-2xl">
                  {user.bio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">暂无简介</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  加入于 {formatDate(user.createdAt)}
                </span>
                {isOwn && (
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1 text-primary-light hover:underline"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    编辑资料
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* 关键指标 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-5 border-t border-border">
            <StatCell label="解题" value={String(solved)} />
            <StatCell label="提交" value={String(submits)} />
            <StatCell label="通过率" value={`${passRate}%`} />
            <StatCell label="近 7 天 AC" value={String(weekTotal)} />
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {/* 热力图优先：比 7 日图信息密度更高 */}
            <section className="card-static rounded-xl p-4 md:p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary-light" />
                提交日历
                <span className="text-xs font-normal text-muted-foreground">近一年</span>
              </h2>
              <SubmissionHeatmap data={yearActivity} days={365} color={user.color || undefined} />
            </section>

            <section className="card-static rounded-xl p-4 md:p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Code className="w-4 h-4 text-primary-light" />
                最近提交
              </h2>
              {recentSubmissions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">暂无提交记录</div>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-2 px-2">题目</th>
                        <th className="text-left font-medium py-2 px-2 w-24">状态</th>
                        <th className="text-left font-medium py-2 px-2 w-20">语言</th>
                        <th className="text-right font-medium py-2 px-2 w-28">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSubmissions.map((submission) => (
                        <tr
                          key={submission.id}
                          className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-2.5 px-2">
                            <Link
                              href={`/problems/${submission.realProblemId || submission.problemId}`}
                              className="group inline-flex items-baseline gap-1.5 min-w-0 max-w-full"
                            >
                              <span className="font-mono text-xs text-primary-light shrink-0">
                                {submission.problemId}
                              </span>
                              <span className="text-foreground group-hover:text-primary-light truncate">
                                {submission.problemTitle}
                              </span>
                            </Link>
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className={`tag text-xs ${statusTagClass(submission.status)}`}
                            >
                              {submission.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground text-xs">
                            {submission.language}
                          </td>
                          <td className="py-2.5 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {submission.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20">
            <section className="card-static rounded-xl p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-light" />
                近 7 天通过
              </h2>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="profileAcFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={28}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--foreground)',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="通过"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#profileAcFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {weekTotal === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-1">近一周暂无通过</p>
              )}
            </section>

            {difficultyDistribution.length > 0 && (
              <section className="card-static rounded-xl p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary-light" />
                  已解决难度
                </h2>
                <ul className="space-y-2.5">
                  {difficultyDistribution.map((item) => {
                    const total = difficultyDistribution.reduce((a, c) => a + c.count, 0) || 1
                    const pct = (item.count / total) * 100
                    return (
                      <li key={item.difficulty}>
                        <div className="flex items-center justify-between text-xs mb-1 gap-2">
                          <span className="text-foreground truncate">{item.difficulty}</span>
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${difficultyBarClass(item.difficulty)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {isOwn && (
              <Link
                href="/settings"
                className="card-static rounded-xl p-3.5 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  个人设置
                </span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </aside>
        </div>
      </div>
    </EducationalPageShell>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground tabular-nums mt-0.5">{value}</div>
    </div>
  )
}
