'use client'

import { useEffect, useState } from 'react'
import { Timer, Play, CheckCircle2 } from 'lucide-react'
import { computeContestCountdown, type ContestCountdownState } from '@/lib/contest/countdown'

interface ContestCountdownPanelProps {
  startTime: string | Date
  endTime: string | Date
  className?: string
}

export default function ContestCountdownPanel({
  startTime,
  endTime,
  className = '',
}: ContestCountdownPanelProps) {
  const [state, setState] = useState<ContestCountdownState>(() =>
    computeContestCountdown(startTime, endTime)
  )

  useEffect(() => {
    const tick = () => setState(computeContestCountdown(startTime, endTime))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime, endTime])

  const Icon =
    state.phase === 'running' ? Play : state.phase === 'upcoming' ? Timer : CheckCircle2

  const barClass =
    state.phase === 'running'
      ? 'bg-secondary'
      : state.phase === 'upcoming'
        ? 'bg-primary'
        : 'bg-muted-foreground/50'

  return (
    <div
      className={`card-static rounded-lg border border-border overflow-hidden ${className}`}
      aria-live="polite"
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 shrink-0 text-primary-light" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">{state.label}</span>
        </div>
        <span className="font-mono text-lg sm:text-xl font-bold text-primary-light tabular-nums tracking-tight">
          {state.display}
        </span>
      </div>
      <div className="h-1 w-full bg-muted">
        <div
          className={`h-full transition-all duration-1000 ${barClass}`}
          style={{ width: `${state.progress}%` }}
        />
      </div>
    </div>
  )
}