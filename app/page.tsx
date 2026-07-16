'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Trophy,
  Target,
  Users,
  ArrowRight,
  Cpu,
  Dumbbell,
  Clock,
  CheckCircle2,
  Calendar,
  BarChart3,
  TrendingUp,
  ChevronRight,
  Loader2,
  Megaphone,
  Pin,
  Sparkles,
  Mountain,
  Compass,
  GraduationCap,
  Zap,
  Code,
  GitBranch,
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import type { HomeDashboardData } from '@/lib/home/dashboard'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'
import { formatDate } from '@/lib/utils'

/* ---------- non-logged-in feature cards ---------- */

const guestFeatures = [
  {
    icon: BookOpen,
    title: '海量题库',
    description: '从语法入门到 NOI 难度，按知识点与难度梯度精心编排，总能找到适合你的下一题。',
    accent: 'from-blue-500 to-indigo-600',
  },
  {
    icon: Cpu,
    title: '毫秒级评测',
    description: '基于容器化沙箱的实时评测引擎，C++ / Python 即时代码反馈，错误一目了然。',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    icon: Trophy,
    title: '多元竞赛',
    description: '支持 ACM、OI、IOI 等多种赛制，实时排行榜与详细解题数据，赛出真实水平。',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    icon: Dumbbell,
    title: '系统训练',
    description: '结构化训练计划、知识点专题、同步练习与班级作业，让成长有迹可循。',
    accent: 'from-rose-500 to-pink-600',
  },
]

/* ---------- climb path data ---------- */

const climbPath = [
  {
    level: '山脚 · 入门',
    icon: Compass,
    color: 'from-emerald-400 to-emerald-600',
    description: '变量、循环、函数、基础算法思维。迈出第一步，看见山的轮廓。',
    example: '100 道起步题，覆盖语法与基本数据结构',
  },
  {
    level: '山腰 · 进阶',
    icon: Code,
    color: 'from-sky-400 to-blue-600',
    description: '动态规划、图论、贪心策略。在斜坡上保持节奏，越走越稳。',
    example: 'CSP-J/NOIP 难度真题训练',
  },
  {
    level: '山顶 · 挑战',
    icon: Trophy,
    color: 'from-amber-400 to-orange-600',
    description: '高阶数据结构、数学证明、复杂算法综合。站在山顶，看见更远的天空。',
    example: 'NOI/ICPC 区域赛真题挑战',
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
                    ? formatDate(item.publishedAt)
                    : formatDate(item.createdAt)}
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

/* ---------- section header helper ---------- */

function SectionHeader({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
}: {
  eyebrow: string
  eyebrowIcon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center mb-8 md:mb-10">
      <div className="inline-flex items-center gap-2 text-primary text-xs md:text-sm font-semibold mb-3 uppercase tracking-wider">
        <EyebrowIcon className="w-3.5 h-3.5" />
        <span>{eyebrow}</span>
      </div>
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-3 tracking-tight">
        {title}
      </h2>
      <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        {subtitle}
      </p>
    </div>
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

/* ---------- non-logged-in intro view ---------- */

function GuestView() {
  const { settings } = useSettings()
  const siteName = settings.siteName || '大山 OJ'
  const tagline = '代码如山·算法为径'
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
    <div className="space-y-12 md:space-y-16">
      {/* ============ Hero ============ */}
      <section className="relative pt-4 pb-8 md:pt-8 md:pb-12 overflow-hidden">
        {/* 背景山形装饰：更克制、分层 */}
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]">
            <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0 320 L100 200 L200 240 L320 140 L440 200 L560 100 L680 180 L800 140 L920 220 L1040 180 L1200 260 L1200 400 L0 400 Z" fill="currentColor" />
            </svg>
          </div>
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
            <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0 360 L120 280 L240 310 L360 250 L480 290 L600 230 L720 280 L840 260 L960 300 L1080 270 L1200 310 L1200 400 L0 400 Z" fill="currentColor" />
            </svg>
          </div>
          {/* 顶部渐隐光晕 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 dark:bg-primary/15 rounded-full blur-[80px] opacity-60" />
        </div>

        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            {/* 胶囊徽章 */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs md:text-sm font-semibold mb-6 animate-fadeIn border border-primary/15">
              <Mountain className="w-3.5 h-3.5" />
              <span>攀登者集结 · 你的下一道题在山顶等你</span>
            </div>

            {/* 主标题 */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground mb-5 leading-[1.1] tracking-tight animate-fadeIn">
              <span className="block">{tagline}</span>
              <span className="block mt-1.5 bg-gradient-to-r from-primary via-blue-500 to-indigo-600 bg-clip-text text-transparent">
                陪你从入门到顶峰
              </span>
            </h1>

            {/* 副标题 */}
            <p className="text-sm md:text-base lg:text-lg text-muted-foreground mb-8 leading-relaxed animate-fadeIn max-w-2xl mx-auto" style={{ animationDelay: '80ms' }}>
              {siteName} 是一站式在线编程学习与竞赛平台。精心编排的题库、毫秒级实时评测、多元赛制竞赛与体系化训练路径，让每一位攀登者都能看见自己的成长曲线。
            </p>

            {/* CTA 按钮 */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-fadeIn" style={{ animationDelay: '160ms' }}>
              <Link href="/register" className="btn btn-primary text-base px-7 py-3 h-auto">
                <Sparkles className="w-5 h-5" />
                开始我的攀登
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/problems" className="btn btn-outline text-base px-7 py-3 h-auto">
                <BookOpen className="w-5 h-5" />
                探索题库
              </Link>
            </div>

            {/* 三联标识：更紧凑 */}
            <div className="flex items-center justify-center gap-4 md:gap-8 mt-8 text-xs md:text-sm text-muted-foreground animate-fadeIn" style={{ animationDelay: '240ms' }}>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-primary" />
                <span>即时评测反馈</span>
              </div>
              <span className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span>体系化训练</span>
              </div>
              <span className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-primary" />
                <span>多元竞赛</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 公告（紧凑） ============ */}
      {announcements.length > 0 && (
        <section className="container mx-auto px-4">
          <AnnouncementsGrid items={announcements} />
        </section>
      )}

      {/* ============ 攀登路线 ============ */}
      <section className="container mx-auto px-4">
        <SectionHeader
          eyebrow="攀登路线"
          eyebrowIcon={Compass}
          title="三段式成长路径"
          subtitle="编程如登山，没有捷径但有路径。我们为不同阶段的攀登者，准备了清晰可循的训练阶梯。"
        />

        {/* 路径卡片 + 连接线 */}
        <div className="relative">
          {/* desktop 横向连接线 */}
          <div className="hidden md:block absolute top-[3.25rem] left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-emerald-300 via-blue-300 to-amber-300 dark:from-emerald-700 dark:via-blue-700 dark:to-amber-700 opacity-50" aria-hidden />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 animate-stagger-in">
            {climbPath.map((step, idx) => {
              const Icon = step.icon
              return (
                <div key={idx} className="card-static rounded-2xl p-6 md:p-7 relative overflow-hidden group">
                  {/* 背景渐变光斑 */}
                  <div className={`absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br ${step.color} opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500 blur-2xl`} />

                  <div className="relative">
                    {/* 图标 + 序号 */}
                    <div className="flex items-center justify-between mb-5">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg ring-4 ring-card`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <span className="text-4xl font-black text-muted-foreground/15 select-none tabular-nums">
                        {idx + 1}
                      </span>
                    </div>

                    {/* 标题 */}
                    <h3 className="text-lg md:text-xl font-bold text-foreground mb-2">{step.level}</h3>

                    {/* 描述 */}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {step.description}
                    </p>

                    {/* 示例标签 */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/8 dark:bg-primary/15 px-2.5 py-1 rounded-md">
                      <GitBranch className="w-3.5 h-3.5" />
                      {step.example}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ 核心能力 ============ */}
      <section className="container mx-auto px-4">
        <SectionHeader
          eyebrow="核心能力"
          eyebrowIcon={Target}
          title="为攀登者打造的四大基石"
          subtitle="从题库到评测，从训练到竞赛，每一块基石都为你的下一次提交保驾护航。"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 animate-stagger-in">
          {guestFeatures.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div key={index} className="card-static rounded-2xl p-6 group cursor-default flex flex-col">
                {/* 图标：多色渐变 */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.accent} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="container mx-auto px-4">
        <div className="card-static rounded-3xl p-8 md:p-12 lg:p-16 text-center max-w-4xl mx-auto relative overflow-hidden">
          {/* 背景山形装饰：放大、更可见 */}
          <div className="absolute inset-0 -z-10 opacity-[0.04] dark:opacity-[0.07]">
            <svg viewBox="0 0 800 300" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0 300 L80 180 L160 220 L240 100 L320 160 L400 60 L480 140 L560 100 L640 180 L720 140 L800 200 L800 300 Z" fill="currentColor" />
            </svg>
          </div>
          {/* 光晕 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-primary/8 dark:bg-primary/12 rounded-full blur-[80px] -z-10" />

          {/* 图标 */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/30">
            <Mountain className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4 tracking-tight">
            山顶的风景，值得每一位攀登者
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed max-w-xl mx-auto text-sm md:text-base">
            注册即拥有完整的学习轨迹、训练计划与竞赛入口。记录每一次 AC，见证每一段成长。
          </p>

          {/* 按钮：平衡宽度 */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
            <Link href="/register" className="btn btn-primary text-base px-8 py-3 h-auto min-w-[200px]">
              <Sparkles className="w-5 h-5" />
              免费注册
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/login" className="btn btn-outline text-base px-8 py-3 h-auto min-w-[200px]">
              已有账号？登录
            </Link>
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
  // 最终兜底：确保品牌名称/描述永不显示空白
  const siteName = settings.siteName || '大山 OJ'
  const siteDescription = settings.siteDescription || '代码如山·算法为径·陪你从入门到顶峰'

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      <div className="container mx-auto px-4 py-6 md:py-10 flex-1">
        {user ? <DashboardView /> : <GuestView />}
      </div>

      <footer className="mt-auto border-t border-border bg-muted/20">
        <div className="container mx-auto px-4">
          {/* 上区：品牌 + 导航 + 友情链接 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 py-8">
            {/* 品牌区 */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-white ring-1 ring-border/40 shrink-0">
                <img
                  src="/logos/dsojlogo.png"
                  alt={`${siteName} Logo`}
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-foreground text-sm leading-tight">{siteName}</span>
                <span className="text-[11px] text-muted-foreground leading-snug mt-0.5">{siteDescription}</span>
              </div>
            </div>

            {/* 导航区 */}
            <nav className="flex flex-col items-start md:items-center gap-2 md:gap-2.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">导航</span>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <Link href="/problems" className="hover:text-primary transition-colors duration-200 font-medium">题库</Link>
                <Link href="/contests" className="hover:text-primary transition-colors duration-200 font-medium">竞赛</Link>
                <Link href="/training" className="hover:text-primary transition-colors duration-200 font-medium">训练</Link>
                <Link href="/rank" className="hover:text-primary transition-colors duration-200 font-medium">排行榜</Link>
              </div>
            </nav>

            {/* 友情链接区 */}
            <div className="flex flex-col items-start md:items-end gap-2 md:gap-2.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">友情链接</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground md:justify-end">
                <a
                  href="https://www.luogu.com.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors duration-200 font-medium"
                >
                  洛谷
                </a>
                <span className="text-border/60">·</span>
                <a
                  href="https://oj.czos.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors duration-200 font-medium"
                >
                  东方博宜OJ
                </a>
              </div>
            </div>
          </div>

          {/* 下区：版权 */}
          <div className="border-t border-border/60 py-4">
            <p className="text-center text-xs text-muted-foreground/80">
              &copy; {new Date().getFullYear()} {siteName} · 代码如山·算法为径·陪你从入门到顶峰
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}