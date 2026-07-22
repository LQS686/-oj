'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, FileText, List, BarChart2, Info, Play, Timer, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDateTimeShort } from '@/lib/utils'
import { PageContainer } from '@/components/layout'

interface Contest {
  id: string
  title: string
  startTime: Date
  endTime: Date
  type: string
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const h = hours % 24
    return h > 0 ? `${days}天 ${h}小时` : `${days}天`
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatContestRange(start: Date, end: Date) {
  const fmt = (d: Date) => formatDateTimeShort(d)
  return `${fmt(new Date(start))} — ${fmt(new Date(end))}`
}

export default function ContestHeader({
  contest,
  canViewDetails = false,
}: {
  contest: Contest
  canViewDetails?: boolean
}) {
  const pathname = usePathname()
  const [timeLeft, setTimeLeft] = useState('')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const start = new Date(contest.startTime).getTime()
      const end = new Date(contest.endTime).getTime()

      if (now < start) {
        setStatus('即将开始')
        setTimeLeft(formatDuration(start - now))
        setProgress(0)
      } else if (now > end) {
        setStatus('已结束')
        setTimeLeft('00:00:00')
        setProgress(100)
      } else {
        setStatus('进行中')
        setTimeLeft(formatDuration(end - now))
        const total = end - start
        setProgress(total > 0 ? Math.min(100, ((now - start) / total) * 100) : 0)
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [contest])

  const getStatusConfig = () => {
    switch (status) {
      case '进行中':
        return {
          tag: 'tag-success',
          icon: Play,
          ring: 'ring-secondary/20',
          bar: 'bg-gradient-to-r from-secondary to-secondary-light',
        }
      case '即将开始':
        return {
          tag: 'tag-primary',
          icon: Timer,
          ring: 'ring-primary/20',
          bar: 'bg-gradient-to-r from-primary to-primary-light',
        }
      case '已结束':
        return {
          tag: 'tag',
          icon: CheckCircle2,
          ring: 'ring-border',
          bar: 'bg-muted-foreground/50',
        }
      default:
        return {
          tag: 'tag',
          icon: Clock,
          ring: 'ring-border',
          bar: 'bg-primary',
        }
    }
  }

  const baseTabs = [{ name: '概览', path: `/contests/${contest.id}`, icon: Info }]
  const detailTabs = [
    { name: '题目', path: `/contests/${contest.id}/problems`, icon: FileText },
    { name: '提交', path: `/contests/${contest.id}/submissions`, icon: List },
    { name: '排名', path: `/contests/${contest.id}/rank`, icon: BarChart2 },
  ]
  const tabs = canViewDetails ? [...baseTabs, ...detailTabs] : baseTabs

  const isActive = (path: string) => {
    if (path === `/contests/${contest.id}`) return pathname === path
    return pathname.startsWith(path)
  }

  const statusConfig = getStatusConfig()
  const StatusIcon = statusConfig.icon
  const countdownLabel =
    status === '已结束' ? '已结束' : status === '即将开始' ? '距开始' : '剩余'

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-14 z-30">
      <PageContainer>
        {/* 主信息：单行优先，窄屏自动换行 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 min-h-[52px]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center ring-1 ${statusConfig.ring}`}
            >
              <StatusIcon className="w-4 h-4 text-primary-light" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{contest.title}</h1>
            <span className={`shrink-0 ${statusConfig.tag} text-xs`}>{status || '…'}</span>
            <span className="tag tag-primary text-xs shrink-0">{contest.type}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 max-w-[280px] lg:max-w-none truncate">
              <Clock className="w-3.5 h-3.5 shrink-0 text-primary-light" />
              {formatContestRange(contest.startTime, contest.endTime)}
            </span>
            <div className="flex items-center gap-2 min-w-[140px] sm:min-w-[168px]">
              <span className="text-muted-foreground whitespace-nowrap">{countdownLabel}</span>
              <span className="font-mono font-semibold text-primary-light tabular-nums">{timeLeft}</span>
            </div>
          </div>
        </div>

        {/* 细进度条：不占独立大块 */}
        <div className="h-0.5 w-full bg-muted rounded-full overflow-hidden -mt-0.5 mb-0">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${statusConfig.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Tab：与题目页一致的底边线样式 */}
        <nav className="flex gap-0 overflow-x-auto -mb-px scrollbar-none" aria-label="竞赛导航">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.path)
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-primary text-primary-light'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.name}
              </Link>
            )
          })}
        </nav>
      </PageContainer>
    </header>
  )
}