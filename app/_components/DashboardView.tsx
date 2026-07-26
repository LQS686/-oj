'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Users,
  Clock,
  CheckCircle2,
  Calendar,
  BarChart3,
  TrendingUp,
  ChevronRight,
  Loader2,
  Mountain,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import type { HomeDashboardData } from '@/lib/home/dashboard'
import { AnnouncementsGrid } from '@/app/_components/AnnouncementsGrid'
import { StatusBadge } from '@/app/_components/StatusBadge'
import { useAnnouncementSocket } from '@/hooks/useAnnouncementSocket'
import { useUser } from '@/contexts/UserContext'
import { canManageContent, getRoleLabel } from '@/lib/permissions'
import toast from 'react-hot-toast'

export function DashboardView() {
  const { user } = useUser()
  const [data, setData] = useState<HomeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 与设置页「系统公告」开关对齐：关闭后不弹新公告 toast */
  const [allowAnnouncementToast, setAllowAnnouncementToast] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchWithCookie('/api/users/preferences')
        const json = await res.json()
        if (
          !cancelled &&
          json.success &&
          json.data?.notifications &&
          typeof json.data.notifications.systemAnnouncement === 'boolean'
        ) {
          setAllowAnnouncementToast(json.data.notifications.systemAnnouncement)
        }
      } catch {
        // 偏好拉取失败时保持默认开启
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchDashboard = useCallback(async () => {
    try {
      setError('')
      const res = await fetchWithCookie('/api/home/dashboard')
      const json = await res.json()
      if (!json.success && !json.ok) {
        throw new Error(json.error || '加载失败')
      }
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const res = await fetchWithCookie('/api/home/dashboard')
        const json = await res.json()
        if (!json.success && !json.ok) {
          throw new Error(json.error || '加载失败')
        }
        if (!cancelled) setData(json.data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 监听公告实时推送：新发布时弹 toast 提示并刷新首页公告区
  useAnnouncementSocket({
    enabled: true,
    onUpdate: () => {
      // 公告变更（更新/删除/撤回）静默刷新首页数据
      void fetchDashboard()
    },
    onPublished: (event) => {
      if (!allowAnnouncementToast) return
      const title = event.title || '点击公告页查看'
      toast.success(`新公告：${title}`, { duration: 5000 })
    },
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <span className="text-sm">加载学习数据…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card-static rounded-xl p-6 text-center">
        <p className="text-error mb-3 text-sm">{error || '暂无数据'}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    )
  }

  const { stats, announcements, recentAssignments, upcomingContests } = data
  const displayName = user?.nickname || user?.username || '同学'
  const isStaff = canManageContent(user)
  const welcomeTitle = isStaff ? `${displayName}，欢迎回来` : `${displayName}，继续攀登`
  const roleOrRank = isStaff ? getRoleLabel(user?.role) : stats.rank
  const welcomeHint = isStaff
    ? '题目、竞赛与班级都可以从这里进入管理'
    : stats.todaySolved > 0
      ? `今日已通过 ${stats.todaySolved} 题，状态不错`
      : '今天还没有通过题目，去题库开练吧'

  return (
    <div className="space-y-6">
      {/* 欢迎条 */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 85% 120% at 0% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 55%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.06] text-foreground"
          aria-hidden
        >
          <svg viewBox="0 0 800 120" className="w-full h-full" preserveAspectRatio="xMidYMax slice">
            <path
              d="M0 120 L60 70 L140 95 L220 40 L300 85 L400 28 L500 75 L600 45 L700 90 L800 55 L800 120 Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="relative flex items-center gap-3.5 px-4 py-4 md:px-5">
          <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
            <Mountain className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-bold text-foreground tracking-tight truncate">
              {welcomeTitle}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">
              {roleOrRank}
              <span className="mx-1.5 text-border">·</span>
              {welcomeHint}
            </p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-stagger-in">
        <div className="card-static rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 w-[18px] h-[18px] text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">今日解题</span>
          </div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{stats.todaySolved}</div>
          <div className="text-xs text-muted-foreground mt-1">本周提交 {stats.weeklySubmissions} 次</div>
        </div>

        <div className="card-static rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Mountain className="w-[18px] h-[18px] text-primary-foreground" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">累计 AC</span>
          </div>
          <div className="text-2xl font-bold text-foreground tabular-nums">
            {stats.totalSolved}
            <span className="text-sm font-normal text-muted-foreground"> 题</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">历史通过</div>
        </div>

        <div className="card-static rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <TrendingUp className="w-[18px] h-[18px] text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">本周通过率</span>
          </div>
          <div className="text-2xl font-bold text-foreground tabular-nums">
            {stats.weeklyPassRate}
            <span className="text-sm font-normal text-muted-foreground">%</span>
          </div>
          {stats.weeklyPassRateDelta !== null ? (
            <div
              className={`text-xs mt-1 ${
                stats.weeklyPassRateDelta >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-muted-foreground'
              }`}
            >
              较上周 {stats.weeklyPassRateDelta >= 0 ? '+' : ''}
              {stats.weeklyPassRateDelta}%
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">本周暂无提交</div>
          )}
        </div>

        <div className="card-static rounded-xl p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center">
              <BarChart3 className="w-[18px] h-[18px] text-sky-600 dark:text-sky-400" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Rating</span>
          </div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{stats.rating}</div>
          <div className="text-xs text-sky-600 dark:text-sky-400 mt-1">
            {isStaff ? '竞赛积分' : stats.rank}
          </div>
        </div>
      </div>

      {announcements.length > 0 && <AnnouncementsGrid items={announcements} />}

      {recentAssignments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">近期作业</h2>
            <Link href="/classes" className="text-sm text-primary hover:underline flex items-center gap-1">
              查看全部 <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger-in">
            {recentAssignments.map((item) => (
              <Link
                key={item.id}
                href={`/classes/${item.classId}/assignments/${item.id}`}
                className="card-static rounded-xl p-4 block hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate flex-1">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-xs text-muted-foreground mb-3 truncate">{item.className}</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.deadline ? `截止 ${item.deadline}` : '无截止时间'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {item.submitted}/{item.total} 已提交
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {upcomingContests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">即将开始的竞赛</h2>
            <Link href="/contests" className="text-sm text-primary hover:underline flex items-center gap-1">
              查看全部 <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger-in">
            {upcomingContests.map((item) => (
              <Link
                key={item.id}
                href={`/contests/${item.id}`}
                className="card-static rounded-xl p-4 block hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                    {item.type}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2 line-clamp-2">{item.title}</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{item.startTime}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{item.durationLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    <span>{item.participants} 人报名</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
