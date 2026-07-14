'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Code2,
  Trophy,
  Users,
  BookOpen,
  ArrowRight,
  Cpu,
  Dumbbell,
  Clock,
  CheckCircle2,
  Star,
  Flame,
  Calendar,
  BarChart3,
  TrendingUp,
  ChevronRight,
  Loader2,
  Megaphone,
  Pin,
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import type { HomeDashboardData } from '@/lib/home/dashboard'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'

/* ---------- non-logged-in feature cards ---------- */

const guestFeatures = [
  {
    icon: BookOpen,
    title: '海量题库',
    description: '涵盖入门到NOI难度，算法、数据结构、数学等多个领域的优质题目',
  },
  {
    icon: Cpu,
    title: '实时评测',
    description: '支持C++、Python、Java等多种语言，毫秒级响应，精准反馈',
  },
  {
    icon: Trophy,
    title: '竞赛系统',
    description: 'ACM、OI、IOI多种赛制，实时排行榜和详细数据分析',
  },
  {
    icon: Dumbbell,
    title: '训练计划',
    description: '系统化学习路径，循序渐进提升编程能力和算法思维',
  },
]

/* ---------- components ---------- */

function AnnouncementsGrid({ items }: { items: PublicAnnouncementItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">系统公告</h2>
        </div>
        <Link href="/announcements" className="text-sm text-primary hover:underline flex items-center gap-1">
          查看全部 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">暂无系统公告</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/announcements/${item.id}`}
              className={`card-static rounded-xl p-5 block hover:border-primary/30 transition-colors h-full ${
                item.isPinned ? 'ring-1 ring-primary/30' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2 gap-1">
                {item.isPinned ? (
                  <Pin className="w-3.5 h-3.5 text-primary shrink-0" aria-label="置顶" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {item.publishedAt
                    ? new Date(item.publishedAt).toLocaleDateString('zh-CN')
                    : new Date(item.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{item.content}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    '进行中': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    '未开始': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    '已截止': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}

/* ---------- logged-in dashboard ---------- */

function DashboardView() {
  const [data, setData] = useState<HomeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger-in">
        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">今日解题</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{stats.todaySolved}</div>
          <div className="text-xs text-muted-foreground mt-1">累计 {stats.totalSolved} 题</div>
        </div>

        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center transition-all duration-300 group-hover:bg-orange-200 dark:group-hover:bg-orange-900/30 group-hover:scale-110">
              <Flame className="w-5 h-5 text-orange-500" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">连续打卡</span>
          </div>
          <div className="text-3xl font-bold text-foreground">
            {stats.streak} <span className="text-base font-normal text-muted-foreground">天</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{stats.streak > 0 ? '继续加油' : '今日开始打卡'}</div>
        </div>

        <div className="card-static rounded-xl p-5 group cursor-default">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center transition-all duration-300 group-hover:bg-green-200 dark:group-hover:bg-green-900/30 group-hover:scale-110">
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
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center transition-all duration-300 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/30 group-hover:scale-110">
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

/* ---------- non-logged-in intro view ---------- */

function GuestView() {
  const [announcements, setAnnouncements] = useState<PublicAnnouncementItem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchWithCookie('/api/announcements?limit=6')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && (json.success || json.ok) && json.data?.items) {
          setAnnouncements(json.data.items)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-16">
      <section className="pt-6 animate-fadeIn">
        <div className="container mx-auto px-4">
          <AnnouncementsGrid items={announcements} />
        </div>
      </section>

      {/* Hero */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground mb-6 leading-tight animate-fadeIn">
            在线编程学习平台
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed animate-fadeIn" style={{ animationDelay: '100ms' }}>
            海量精选题库、实时评测系统、专业竞赛平台，<br className="hidden sm:block" />
            助你从入门到精通，成为编程高手
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fadeIn" style={{ animationDelay: '200ms' }}>
            <Link href="/register" className="btn btn-primary text-base px-8 py-3">
              开始学习
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/problems" className="btn btn-outline text-base px-8 py-3">
              <BookOpen className="w-5 h-5" />
              查看题库
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="pb-16 md:pb-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 animate-stagger-in">
            {guestFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div key={index} className="card-static rounded-xl p-6 group cursor-default">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/25 group-hover:rotate-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Login / Register CTA */}
      <section className="pb-16 md:pb-24">
        <div className="container mx-auto px-4">
          <div className="card-static rounded-2xl p-10 md:p-14 text-center max-w-2xl mx-auto hover-scale">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6 animate-float">
              <Star className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">准备好开始了吗？</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              立即注册，加入平台，开启你的编程学习之旅
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="btn btn-primary text-base px-8 py-3">
                免费注册
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/login" className="btn btn-outline text-base px-8 py-3">
                已有账号？登录
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ---------- main page ---------- */

export default function Home() {
  const { settings } = useSettings()
  const { user } = useUser()

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 md:py-12">
        {user ? <DashboardView /> : <GuestView />}
      </div>

      <footer className="py-10 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center transition-transform duration-300 hover:rotate-12 hover:scale-110">
                <Code2 className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <span className="font-bold text-foreground text-base">{settings.siteName}</span>
                <p className="text-xs text-muted-foreground">{settings.siteDescription}</p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/problems" className="hover:text-primary transition-all duration-200 font-medium hover:scale-105">题库</Link>
              <Link href="/contests" className="hover:text-primary transition-all duration-200 font-medium hover:scale-105">竞赛</Link>
              <Link href="/training" className="hover:text-primary transition-all duration-200 font-medium hover:scale-105">训练</Link>
              <Link href="/rank" className="hover:text-primary transition-all duration-200 font-medium hover:scale-105">排行榜</Link>
            </div>

            <div className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} {settings.siteName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
