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
import toast from 'react-hot-toast'

export function DashboardView() {
  const [data, setData] = useState<HomeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      // 新公告：弹 toast 提示用户查看（toast 文案中带标题，用户可前往公告页查看）
      const title = event.title || '点击公告页查看'
      toast.success(`📢 新公告：${title}`, { duration: 5000 })
    },
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm">加载学习数据…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card-static rounded-xl p-10 text-center">
        <p className="text-error mb-4">{error || '暂无数据'}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    )
  }

  const { stats, announcements, recentAssignments, upcomingContests } = data

  return (
    <div className="space-y-8">
      {/* 品牌欢迎条 */}
      <div className="relative rounded-2xl overflow-hidden border border-border bg-gradient-to-r from-primary/5 via-blue-500/5 to-indigo-600/5 dark:from-primary/10 dark:via-blue-500/10 dark:to-indigo-600/10 p-5 md:p-6">
        <div className="absolute inset-0 -z-10 opacity-[0.04] dark:opacity-[0.07]">
          <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0 200 L80 100 L160 140 L240 60 L320 120 L400 40 L480 100 L560 70 L640 130 L720 90 L800 150 L800 200 Z" fill="currentColor" />
          </svg>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Mountain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
              继续攀登，山顶就在前方
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              每一题都是向上的台阶 · {stats.totalSolved} 题已征服
            </p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger-in">
        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">今日解题</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{stats.todaySolved}</div>
          <div className="text-xs text-muted-foreground mt-1">本周提交 {stats.weeklySubmissions} 次</div>
        </div>

        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-md">
              <Mountain className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">累计 AC</span>
          </div>
          <div className="text-3xl font-bold text-foreground">
            {stats.totalSolved}
            <span className="text-base font-normal text-muted-foreground"> 题</span>
          </div>
          <div className="text-xs text-primary mt-1 font-medium">持续向上</div>
        </div>

        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">本周通过率</span>
          </div>
          <div className="text-3xl font-bold text-foreground">
            {stats.weeklyPassRate}
            <span className="text-base font-normal text-muted-foreground">%</span>
          </div>
          {stats.weeklyPassRateDelta !== null && (
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
          )}
        </div>

        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Rating</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{stats.rating}</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">{stats.rank}</div>
        </div>
      </div>

      <AnnouncementsGrid items={announcements} />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">近期作业</h2>
          <Link href="/classes" className="text-sm text-primary hover:underline flex items-center gap-1">
            查看全部 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        {recentAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">暂无班级作业，加入班级后可在此查看</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 animate-stagger-in">
            {recentAssignments.map((item) => (
              <Link
                key={item.id}
                href={`/classes/${item.classId}/assignments/${item.id}`}
                className="card-static rounded-xl p-5 block hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground truncate flex-1 mr-2">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-xs text-muted-foreground mb-3">{item.className}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{item.deadline ? `截止 ${item.deadline}` : '无截止时间'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.submitted}/{item.total} 已提交
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">即将开始的竞赛</h2>
          <Link href="/contests" className="text-sm text-primary hover:underline flex items-center gap-1">
            查看全部 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        {upcomingContests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">暂无即将开始的公开竞赛</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 animate-stagger-in">
            {upcomingContests.map((item) => (
              <Link
                key={item.id}
                href={`/contests/${item.id}`}
                className="card-static rounded-xl p-5 block hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                    {item.type}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{item.title}</h3>
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
        )}
      </div>

    </div>
  )
}
