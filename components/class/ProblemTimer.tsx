'use client'

/**
 * 班级作业题目计时器组件
 *
 * 行为：
 *   - 挂载时：GET 当前 progress；若未完成则 POST start（自动恢复）
 *   - 卸载时：若仍在计时中（未 AC）→ POST pause
 *   - visibilitychange：
 *     - 页面隐藏 → POST pause（防多窗口/切后台脏数据）
 *     - 页面可见 → 若未完成则 POST start（resume）
 *   - 30 秒心跳：GET progress 同步累计用时（多 tab / 异常恢复场景）
 *   - 1 秒 tick：本地累加显示，避免页面静止时数字不动的视觉问题
 *
 * 显示规则：
 *   - 未完成且计时中：实时累加 "计时中 mm:ss"
 *   - 已完成（completedAt != null）：显示最终用时 "用时 mm:ss"，停止 tick
 *   - 加载中：显示 "—"
 *
 * 注意：本组件不直接查询 AC 状态，依赖后端 progress.completedAt 作为唯一真相源。
 *      当评测 Worker 调用 finalizeTiming 后，下次 GET / 心跳会感知到 completedAt。
 */

import { useEffect, useRef, useState } from 'react'
import { Clock, CheckCircle2, PauseCircle } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'

export interface ProblemTimerProgress {
  id?: string
  timeStarted?: string
  timeElapsedMs?: number
  lastResumedAt?: string | null
  isPaused?: boolean
  completedAt?: string | null
  finalTimeMs?: number | null
}

export interface ProblemTimerProps {
  classId: string
  assignmentId: string
  problemId: string
  /** 父组件可选：传入已 AC 标志，用于在评测结果未回写前快速切换显示最终用时 */
  acHint?: boolean
  /** 父组件可选：传入作业结束时间，超过此时间后不再启动/恢复计时（仍展示已累计用时） */
  assignmentEndTime?: string | Date | null
  className?: string
  /**
   * 父组件可选：是否为当前选中题（被动展示模式）。
   * - true（默认）：完整计时逻辑（start/pause/visibility/heartbeat/tick）
   * - false：仅 fetchProgress 一次用于展示累计用时，不启动计时、不监听 visibility、不心跳、不 tick
   */
  active?: boolean
  /** 窄栏模式：仅图标 + 时长，省略中文前缀 */
  compact?: boolean
}

/**
 * 将毫秒格式化为 mm:ss 或 h:mm:ss
 * - < 1 小时：mm:ss（如 05:23）
 * - ≥ 1 小时：h:mm:ss（如 1:23:45）
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

const HEARTBEAT_INTERVAL_MS = 30_000
const TICK_INTERVAL_MS = 1000

export default function ProblemTimer({
  classId,
  assignmentId,
  problemId,
  acHint,
  assignmentEndTime,
  className,
  active = true,
  compact = false,
}: ProblemTimerProps) {
  const [progress, setProgress] = useState<ProblemTimerProgress | null>(null)
  const [displayMs, setDisplayMs] = useState<number>(0)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  // ref 镜像，避免 effect 闭包拿到陈旧值
  const isCompletedRef = useRef(false)
  const baseUrlRef = useRef('')
  const assignmentEndedRef = useRef(false)
  // active 镜像：供卸载 / visibilitychange 等只读最新值的 effect 使用
  const activeRef = useRef(true)
  // 标记 active 切换 effect 是否为首次挂载（首次由 init effect 处理）
  const firstRunRef = useRef(true)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    baseUrlRef.current = `/api/classes/${classId}/assignments/${assignmentId}/problems/${problemId}/timing`
    if (assignmentEndTime) {
      const endMs = new Date(assignmentEndTime).getTime()
      assignmentEndedRef.current = !Number.isNaN(endMs) && Date.now() > endMs
    } else {
      assignmentEndedRef.current = false
    }
  }, [classId, assignmentId, problemId, assignmentEndTime])

  const callTiming = async (action: 'start' | 'pause' | 'resume') => {
    try {
      const res = await fetchWithCookie(baseUrlRef.current, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data?.success && data?.data?.progress) {
        applyProgress(data.data.progress)
      }
    } catch (err) {
      // 计时失败不应阻断作答，仅记录
      logger.warn('ProblemTimer callTiming failed', { action, err: String(err) })
    }
  }

  const fetchProgress = async () => {
    try {
      const res = await fetchWithCookie(baseUrlRef.current, { method: 'GET' })
      const data = await res.json()
      if (data?.success && data?.data?.progress) {
        applyProgress(data.data.progress)
      }
    } catch (err) {
      logger.warn('ProblemTimer fetchProgress failed', { err: String(err) })
    }
  }

  /**
   * 应用新的 progress 状态到本地 state：
   *   - 同步 isCompleted
   *   - 计算 displayMs（计时中包含 lastResumedAt → now 的增量；已完成用 finalTimeMs）
   */
  const applyProgress = (p: ProblemTimerProgress | null) => {
    if (!p) {
      setProgress(null)
      setDisplayMs(0)
      setIsCompleted(false)
      isCompletedRef.current = false
      setLoading(false)
      return
    }

    const completed = !!p.completedAt
    setIsCompleted(completed)
    isCompletedRef.current = completed

    if (completed) {
      // 已完成：使用 finalTimeMs 作为最终展示
      setDisplayMs(p.finalTimeMs ?? p.timeElapsedMs ?? 0)
    } else if (!p.isPaused && p.lastResumedAt) {
      // 计时中：累加最后一段
      const delta = Math.max(0, Date.now() - new Date(p.lastResumedAt).getTime())
      setDisplayMs((p.timeElapsedMs ?? 0) + delta)
    } else {
      // 已暂停：直接展示累计用时
      setDisplayMs(p.timeElapsedMs ?? 0)
    }

    setProgress(p)
    setLoading(false)
  }

  // 挂载：先 GET，再根据状态决定是否 start
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      await fetchProgress()
      if (cancelled) return
      // 仅当 active 时才 start；非选中题（被动展示）只 fetchProgress 一次
      if (
        activeRef.current &&
        !isCompletedRef.current &&
        !assignmentEndedRef.current
      ) {
        await callTiming('start')
      }
    }
    void init()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, assignmentId, problemId])

  // 卸载：暂停计时（仅当未完成时）
  useEffect(() => {
    return () => {
      // 非选中题（被动展示）从未启动计时，无需 pause
      if (!activeRef.current) return
      if (!isCompletedRef.current) {
        // 使用 sendBeacon 提高页面卸载时的送达率
        try {
          const url = baseUrlRef.current
          const blob = new Blob([JSON.stringify({ action: 'pause' })], {
            type: 'application/json',
          })
          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            navigator.sendBeacon(url, blob)
            return
          }
        } catch {
          // sendBeacon 失败时不影响主流程
        }
        // 降级：直接 fetch（async，不等待）
        void callTiming('pause')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, assignmentId, problemId])

  // visibilitychange：隐藏 pause，可见 resume
  useEffect(() => {
    const handleVisibility = () => {
      if (typeof document === 'undefined') return
      // 非选中题不参与 visibility 联动（被动展示模式）
      if (!activeRef.current) return
      if (document.hidden) {
        if (!isCompletedRef.current) {
          void callTiming('pause')
        }
      } else {
        // 作业已结束时不 resume（后端会拒绝，避免无意义请求）
        if (!isCompletedRef.current && !assignmentEndedRef.current) {
          void callTiming('start')
        }
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 30 秒心跳：GET 同步累计用时（也用于感知后端 finalizeTiming 完成）
  useEffect(() => {
    if (isCompleted || !active) return
    const id = setInterval(() => {
      if (!isCompletedRef.current) {
        void fetchProgress()
      }
    }, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted, active])

  // 1 秒 tick：本地累加显示（仅当计时中且未完成时）
  useEffect(() => {
    if (isCompleted || !progress || !active) return
    // 仅在计时中（未暂停）时累加
    if (progress.isPaused) return
    if (!progress.lastResumedAt) return
    const id = setInterval(() => {
      const last = new Date(progress.lastResumedAt!).getTime()
      const delta = Math.max(0, Date.now() - last)
      setDisplayMs((progress.timeElapsedMs ?? 0) + delta)
    }, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isCompleted, progress, active])

  // active 切换：处理 false → true（恢复计时）与 true → false（暂停）
  // 首次挂载由上面的 init effect 处理，这里跳过，避免重复 start
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    if (active) {
      // false → true：刷新进度并恢复计时
      void (async () => {
        await fetchProgress()
        if (!isCompletedRef.current && !assignmentEndedRef.current) {
          await callTiming('start')
        }
      })()
    } else {
      // true → false：暂停计时（保留 displayMs 不变，由后续 effect 清理 interval）
      if (!isCompletedRef.current) {
        void callTiming('pause')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // 父组件传入 acHint → 主动刷新一次 progress，及时感知后端 finalizeTiming 结果
  useEffect(() => {
    if (acHint) {
      void fetchProgress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acHint])

  // 渲染
  if (loading) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-muted-foreground bg-muted/50 border border-border ${className || ''}`}
        title="计时加载中"
      >
        <Clock className="w-3 h-3 animate-pulse" />
        {!compact && '计时加载中'}
      </span>
    )
  }

  if (isCompleted) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-secondary/15 text-secondary border border-secondary/30 ${className || ''}`}
        title="首次 AC 用时"
      >
        <CheckCircle2 className="w-3 h-3" />
        {compact ? formatDurationMs(displayMs) : `用时 ${formatDurationMs(displayMs)}`}
      </span>
    )
  }

  // 作业已结束但题目未 AC：展示累计用时 + 结束标记，不再计时
  if (assignmentEndedRef.current) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-muted/50 text-muted-foreground border border-border ${className || ''}`}
        title="作业已结束（未 AC，仅保留累计用时）"
      >
        <PauseCircle className="w-3 h-3" />
        {compact ? formatDurationMs(displayMs) : `累计 ${formatDurationMs(displayMs)}`}
      </span>
    )
  }

  // 计时中或已暂停
  const isPaused = progress?.isPaused === true
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
        isPaused
          ? 'bg-muted/50 text-muted-foreground border-border'
          : 'bg-primary/10 text-primary-light border-primary/30'
      } ${className || ''}`}
      title={isPaused ? '计时已暂停（离开题目）' : '计时进行中'}
    >
      {isPaused ? (
        <PauseCircle className="w-3 h-3" />
      ) : (
        <Clock className="w-3 h-3" />
      )}
      {compact
        ? formatDurationMs(displayMs)
        : `${isPaused ? '已暂停 ' : '计时 '}${formatDurationMs(displayMs)}`}
    </span>
  )
}
