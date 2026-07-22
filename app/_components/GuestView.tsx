'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Trophy,
  Target,
  ArrowRight,
  Cpu,
  Dumbbell,
  Sparkles,
  Mountain,
  Compass,
  GraduationCap,
  Zap,
  Code,
  GitBranch,
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { fetchWithCookie } from '@/lib/api/base'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'
import { AnnouncementsGrid } from '@/app/_components/AnnouncementsGrid'
import { SectionHeader } from '@/app/_components/SectionHeader'
import { PageContainer } from '@/components/layout'

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

export function GuestView() {
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

        <PageContainer>
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
        </PageContainer>
      </section>

      {/* ============ 公告（紧凑） ============ */}
      {announcements.length > 0 && (
        <PageContainer as="section">
          <AnnouncementsGrid items={announcements} />
        </PageContainer>
      )}

      {/* ============ 攀登路线 ============ */}
      <PageContainer as="section">
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
      </PageContainer>

      {/* ============ 核心能力 ============ */}
      <PageContainer as="section">
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
      </PageContainer>

      {/* ============ CTA ============ */}
      <PageContainer as="section">
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
      </PageContainer>
    </div>
  )
}
