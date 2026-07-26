/**
 * 墙钟对齐的秒级时钟：按整秒边界调度，隐藏标签页时暂停，恢复时立即校正。
 * 用于倒计时 / 相对时间展示，避免 setInterval 漂移与后台空转。
 */
'use client'

import { useEffect, useState } from 'react'

export function useWallClock(active = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const clear = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const scheduleNext = () => {
      if (cancelled) return
      clear()
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      const t = Date.now()
      setNowMs(t)
      // 对齐到下一整秒，减少累计漂移
      const delay = Math.max(16, 1000 - (t % 1000))
      timeoutId = setTimeout(scheduleNext, delay)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleNext()
      } else {
        clear()
      }
    }

    scheduleNext()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])

  return nowMs
}
