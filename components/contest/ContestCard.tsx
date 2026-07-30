'use client'

/**
 * 竞赛列表卡片：更宽信息密度（状态/时间轴/倒计时/题量/报名）
 */
import { useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  Users,
  Lock,
  FileCode,
  User as UserIcon,
  Play,
  Timer,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { formatDateTimeShort, formatDurationMinutes, cn } from '@/lib/utils'
import { computeContestCountdown } from '@/lib/contest/countdown'

export interface ContestCardData {
  id: string
  title: string
  description: string | null
  type: string
  startTime: string
  endTime: string
  duration: number
  isPublic: boolean
  author?: {
    id: string
    username: string
    nickname: string | null
  } | null
  _count?: {
    participants: number
    problems: number
  }
  isRegistered?: boolean
}

function plainDescription(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function statusVisual(phase: 'upcoming' | 'running' | 'ended') {
  switch (phase) {
    case 'running':
      return {
        label: '进行中',
        tag: 'tag-success',
        bar: 'bg-secondary',
        icon: Play,
        iconClass: 'text-secondary-light',
      }
    case 'upcoming':
      return {
        label: '即将开始',
        tag: 'tag-primary',
        bar: 'bg-primary',
        icon: Timer,
        iconClass: 'text-primary-light',
      }
    default:
      return {
        label: '已结束',
        tag: 'tag',
        bar: 'bg-muted-foreground/40',
        icon: CheckCircle2,
        iconClass: 'text-muted-foreground',
      }
  }
}

interface ContestCardProps {
  contest: ContestCardData
  nowMs?: number
}

export default function ContestCard({ contest, nowMs }: ContestCardProps) {
  // 默认参数禁止 Date.now()（render 纯度）；仅无挂载时刻作无时钟兜底
  const [fallbackNow] = useState(() => Date.now())
  const effectiveNow = nowMs ?? fallbackNow
  const countdown = computeContestCountdown(contest.startTime, contest.endTime, effectiveNow)
  const visual = statusVisual(countdown.phase)
  const StatusIcon = visual.icon
  const href =
    countdown.phase === 'ended'
      ? `/contests/${contest.id}/rank`
      : `/contests/${contest.id}`

  const startMs = new Date(contest.startTime).getTime()
  const endMs = new Date(contest.endTime).getTime()
  const durationMinutes =
    contest.duration > 0
      ? contest.duration
      : Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 0

  const desc = plainDescription(contest.description)
  const authorName = contest.author?.nickname || contest.author?.username
  const problems = contest._count?.problems ?? 0
  const participants = contest._count?.participants ?? 0

  return (
    <Link
      href={href}
      className={cn(
        'group relative card-static rounded-xl overflow-hidden border border-border',
        'flex flex-col min-h-[11.5rem] transition-all duration-200',
        'hover:border-primary/35 hover:shadow-sm'
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', visual.bar)} aria-hidden />

      <div className="flex flex-col flex-1 pl-4 pr-4 py-4 gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusIcon className={cn('w-4 h-4 shrink-0', visual.iconClass)} />
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
            {contest.type}
          </span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', visual.tag)}>
            {visual.label}
          </span>
          {!contest.isPublic && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5" />
              私有
            </span>
          )}
          {contest.isRegistered && countdown.phase !== 'ended' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-secondary/10 text-secondary-light ml-auto">
              已报名
            </span>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground line-clamp-1 group-hover:text-primary-light transition-colors">
            {contest.title}
          </h3>
          {desc ? (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {desc}
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {formatDateTimeShort(contest.startTime)}
                <span className="mx-1 text-muted-foreground/50">→</span>
                {formatDateTimeShort(contest.endTime)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {formatDurationMinutes(durationMinutes)}
            </span>
          </div>

          {countdown.phase === 'running' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{countdown.label}</span>
                <span className="font-mono font-semibold text-primary-light tabular-nums">
                  {countdown.display}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-secondary transition-[width] duration-1000"
                  style={{ width: `${countdown.progress}%` }}
                />
              </div>
            </div>
          )}

          {countdown.phase === 'upcoming' && (
            <div className="flex items-center justify-between gap-2 text-xs rounded-lg bg-primary/5 px-2.5 py-1.5">
              <span className="text-muted-foreground">{countdown.label}</span>
              <span className="font-mono font-semibold text-primary-light tabular-nums">
                {countdown.display}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {authorName ? (
              <span className="inline-flex items-center gap-1 min-w-0">
                <UserIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[8rem]">{authorName}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <FileCode className="w-3.5 h-3.5 shrink-0" />
              {problems} 题
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5 shrink-0" />
              {participants} 人
            </span>
            {countdown.phase === 'ended' && (
              <span className="inline-flex items-center gap-1 ml-auto text-muted-foreground/80">
                <AlertCircle className="w-3.5 h-3.5" />
                查看榜单
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
