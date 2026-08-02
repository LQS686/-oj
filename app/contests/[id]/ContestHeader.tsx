'use client'

import { usePathname } from 'next/navigation'
import { FileText, List, ChartBar, Info } from 'lucide-react'
import { formatDateTimeShort } from '@/lib/utils'
import { useContestCountdown } from '@/hooks/useContestCountdown'
import { EntityDetailHeader } from '@/components/entity'

interface Contest {
  id: string
  title: string
  startTime: Date
  endTime: Date
  type: string
}

const PHASE_UI = {
  running: {
    status: '进行中',
    tag: 'tag-success',
    bar: 'bg-secondary',
  },
  upcoming: {
    status: '即将开始',
    tag: 'tag-primary',
    bar: 'bg-primary',
  },
  ended: {
    status: '已结束',
    tag: 'tag',
    bar: 'bg-muted-foreground/40',
  },
} as const

/**
 * 竞赛顶栏：共用 EntityDetailHeader + 赛制/倒计时
 */
export default function ContestHeader({
  contest,
  canViewDetails = false,
}: {
  contest: Contest
  canViewDetails?: boolean
}) {
  const pathname = usePathname()
  const countdown = useContestCountdown(contest.startTime, contest.endTime)
  const statusConfig = PHASE_UI[countdown.phase]

  const tabs = [
    { key: 'overview', label: '概览', icon: Info, href: `/contests/${contest.id}` },
    ...(canViewDetails
      ? [
          {
            key: 'problems',
            label: '题目',
            icon: FileText,
            href: `/contests/${contest.id}/problems`,
          },
          {
            key: 'submissions',
            label: '提交',
            icon: List,
            href: `/contests/${contest.id}/submissions`,
          },
          {
            key: 'rank',
            label: '排名',
            icon: ChartBar,
            href: `/contests/${contest.id}/rank`,
          },
        ]
      : []),
  ]

  // 先匹配最长 path，避免 /contests/:id 前缀误命中概览之外的子路由
  const activeKey =
    [...tabs]
      .filter((t): t is typeof t & { href: string } => !!t.href)
      .sort((a, b) => b.href.length - a.href.length)
      .find((t) =>
        t.key === 'overview' ? pathname === t.href : pathname.startsWith(t.href)
      )?.key ?? 'overview'

  return (
    <EntityDetailHeader
      layoutId="contest-view-tab-indicator"
      title={
        <>
          <h1 className="text-lg font-bold text-foreground truncate">{contest.title}</h1>
          <span className={`shrink-0 text-xs ${statusConfig.tag}`}>{statusConfig.status}</span>
          <span className="tag tag-primary text-xs shrink-0">{contest.type}</span>
        </>
      }
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {countdown.phase === 'ended' ? (
            <span className="tabular-nums">{formatDateTimeShort(contest.endTime)} 结束</span>
          ) : (
            <div
              className="inline-flex items-baseline gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 border border-border/60"
              aria-live="polite"
            >
              <span className="text-muted-foreground whitespace-nowrap">{countdown.label}</span>
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums tracking-tight">
                {countdown.display}
              </span>
            </div>
          )}
        </div>
      }
      banner={
        countdown.phase === 'running' ? (
          <div className="h-0.5 w-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${statusConfig.bar}`}
              style={{ width: `${countdown.progress}%` }}
            />
          </div>
        ) : undefined
      }
      tabs={tabs}
      activeKey={activeKey}
    />
  )
}
