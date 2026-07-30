'use client'

import { useMemo, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import {
  computeContestCountdown,
  type ContestCountdownState,
} from '@/lib/contest/countdown'
import { useWallClock } from '@/hooks/useWallClock'

/** 竞赛阶段倒计时：墙钟对齐；进入「已结束」后停止滴答 */
export function useContestCountdown(
  startTime: Date | string,
  endTime: Date | string
): ContestCountdownState {
  const endMs = useMemo(() => new Date(endTime).getTime(), [endTime])
  const [ticking, setTicking] = useState(() => Date.now() <= endMs)
  const nowMs = useWallClock(ticking)

  const state = useMemo(
    () => computeContestCountdown(startTime, endTime, nowMs),
    [startTime, endTime, nowMs]
  )

  useDeferredEffect(() => {
    if (Date.now() <= endMs) {
      setTicking(true)
    }
  }, [endMs, startTime])

  useDeferredEffect(() => {
    if (state.phase === 'ended') {
      setTicking(false)
    }
  }, [state.phase])

  return state
}
