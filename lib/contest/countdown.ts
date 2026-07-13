export type ContestPhase = 'upcoming' | 'running' | 'ended'

export interface ContestCountdownState {
  phase: ContestPhase
  label: string
  /** 主显示：始终含秒 */
  display: string
  progress: number
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

/** 竞赛倒计时展示，精确到秒（含大于 24 小时：X天 HH:MM:SS） */
function formatContestCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hms = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  if (days > 0) {
    return `${days}天 ${hms}`
  }
  return hms
}

export function computeContestCountdown(
  startTime: Date | string,
  endTime: Date | string,
  nowMs: number = Date.now()
): ContestCountdownState {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()

  if (nowMs < start) {
    return {
      phase: 'upcoming',
      label: '距开始',
      display: formatContestCountdown(start - nowMs),
      progress: 0,
    }
  }
  if (nowMs > end) {
    return {
      phase: 'ended',
      label: '已结束',
      display: '00:00:00',
      progress: 100,
    }
  }
  const total = end - start
  return {
    phase: 'running',
    label: '剩余时间',
    display: formatContestCountdown(end - nowMs),
    progress: total > 0 ? Math.min(100, ((nowMs - start) / total) * 100) : 0,
  }
}