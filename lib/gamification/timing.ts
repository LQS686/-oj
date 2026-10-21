/**
 * lib/gamification/timing.ts
 * 班级作业题目计时服务（Phase 1 启用）
 *
 * 核心模型：ClassAssignmentProblemProgress
 *  - 唯一约束 [assignmentId, problemId, userId]
 *  - 字段：timeStarted / timeElapsedMs / lastResumedAt / isPaused / completedAt / finalTimeMs
 *
 * 计时流程：
 *   打开题目 → startOrResumeTiming（创建或恢复）
 *   离开页面 → pauseTiming（累加用时，置暂停）
 *   重新进入 → startOrResumeTiming（恢复）
 *   首次 AC  → finalizeTiming（停止计时，写入最终用时）
 *
 * 防漏计策略（客户端可能崩溃、断网、丢暂停请求）：
 *   - 客户端每 30s 发 heartbeat，刷新 updatedAt 作为“最后活跃时间”
 *   - 超过 STALE_SESSION_MS 没有心跳的运行中记录，视为已离开：
 *     读取时按最后活跃时间截断，启动/暂停/完成时落库为暂停，避免无限累加
 *   - 历史数据可能存在同键重复记录，所有操作按 updatedAt 选主并把其它运行中记录一并暂停
 *
 * 缓存策略：
 *   - progress 记录走 DB（避免 stale），CacheKeys.timing 仅用于后续 Phase 扩展
 *   - 已完成题目（completedAt != null）不再计时，仅展示最终用时
 */

import { prisma } from '@/lib/prisma'
import type { ClassAssignmentProblemProgress } from '@prisma/client'
import { logger } from '@/lib/logger'

/** 心跳间隔 30s；超过 90s 无心跳视为页面已不可见/客户端已失联 */
const STALE_SESSION_MS = 90_000

type ProgressRecord = ClassAssignmentProblemProgress

function isRunning(progress: ProgressRecord): boolean {
  return !progress.completedAt && !progress.isPaused && progress.lastResumedAt !== null
}

function isStaleRunning(progress: ProgressRecord, now: number): boolean {
  return isRunning(progress) && now - progress.updatedAt.getTime() > STALE_SESSION_MS
}

/** 计算到 cutoff 为止的累计用时（不修改传入对象） */
function elapsedAt(progress: ProgressRecord, cutoffMs: number): number {
  if (!isRunning(progress) || !progress.lastResumedAt) return progress.timeElapsedMs
  return progress.timeElapsedMs + Math.max(0, cutoffMs - progress.lastResumedAt.getTime())
}

/** 正常结束时间取 now；失联会话只统计到最后一次活跃，避免把离线期间算进去 */
function cutoffFor(progress: ProgressRecord, now: number): number {
  return isStaleRunning(progress, now) ? progress.updatedAt.getTime() : now
}

/**
 * 一条记录可能因历史原因重复存在。优先选择已完成记录（终态最可信），
 * 否则选择最近更新的记录；后续操作会暂停其余运行中的旧记录。
 */
async function findProgressRows(
  assignmentId: string,
  problemId: string,
  userId: string
): Promise<ProgressRecord[]> {
  return prisma.classAssignmentProblemProgress.findMany({
    where: { assignmentId, problemId, userId },
    orderBy: { updatedAt: 'desc' },
  })
}

function pickProgress(rows: ProgressRecord[]): ProgressRecord | null {
  return rows.find((row) => row.completedAt) ?? rows[0] ?? null
}

async function pauseRowsAt(rows: ProgressRecord[], now: number): Promise<void> {
  const running = rows.filter((row) => isRunning(row))
  if (running.length === 0) return
  await Promise.all(
    running.map((row) =>
      prisma.classAssignmentProblemProgress.update({
        where: { id: row.id },
        data: {
          timeElapsedMs: elapsedAt(row, cutoffFor(row, now)),
          isPaused: true,
          lastResumedAt: null,
        },
      })
    )
  )
}

/* ============================================================================
 * 核心计时函数
 * ========================================================================== */

/**
 * 启动或恢复计时
 *
 * 行为：
 *   - 记录不存在 → 创建新记录（timeStarted=now, lastResumedAt=now, isPaused=false, timeElapsedMs=0）
 *   - 记录存在且已完成（completedAt != null）→ 直接返回，不重启计时
 *   - 记录存在且 isPaused=true → 置 isPaused=false, lastResumedAt=now
 *   - 记录存在且 isPaused=false → 不操作（已在计时中）
 *   - 失联的运行中记录 → 先按最后活跃时间结算，再从当前时刻恢复
 *   - 同键重复记录 → 其它运行中的记录一并暂停，避免幽灵计时
 *
 * 幂等性：多次调用安全，不会累加错误时间
 */
export async function startOrResumeTiming(assignmentId: string, problemId: string, userId: string) {
  const now = Date.now()
  const rows = await findProgressRows(assignmentId, problemId, userId)
  const existing = pickProgress(rows)

  if (existing?.completedAt) {
    return existing
  }

  // 历史重复记录：只保留一条主记录继续计时，其余运行中的记录立即暂停
  await pauseRowsAt(
    rows.filter((row) => row.id !== existing?.id),
    now
  )

  if (!existing) {
    // 首次打开：创建新记录
    return prisma.classAssignmentProblemProgress.create({
      data: {
        assignmentId,
        problemId,
        userId,
        timeStarted: new Date(now),
        lastResumedAt: new Date(now),
        isPaused: false,
        timeElapsedMs: 0,
      },
    })
  }

  // 已存在且未完成
  if (existing.isPaused) {
    // 从暂停恢复
    return prisma.classAssignmentProblemProgress.update({
      where: { id: existing.id },
      data: {
        isPaused: false,
        lastResumedAt: new Date(now),
        updatedAt: new Date(now),
      },
    })
  }

  if (isStaleRunning(existing, now)) {
    // 失联会话：只累计到最后心跳时间，再从当前时刻恢复
    return prisma.classAssignmentProblemProgress.update({
      where: { id: existing.id },
      data: {
        timeElapsedMs: elapsedAt(existing, existing.updatedAt.getTime()),
        isPaused: false,
        lastResumedAt: new Date(now),
        updatedAt: new Date(now),
      },
    })
  }

  // 已在计时中，直接返回
  return existing
}

/**
 * 暂停计时
 *
 * 行为：
 *   - 记录不存在 → 无操作（避免创建空记录）
 *   - 已完成 → 无操作
 *   - 已暂停 → 无操作
 *   - 计时中 → timeElapsedMs += (now - lastResumedAt)，置 isPaused=true, lastResumedAt=null
 *   - 失联记录只结算到最后活跃时间；同键重复的运行中记录全部暂停
 */
export async function pauseTiming(
  assignmentId: string,
  problemId: string,
  userId: string,
  /** 最多累计到该时间（作业已结束时传结束时间，避免把结束后的停留计入） */
  untilMs?: number
) {
  const now = Math.min(Date.now(), untilMs ?? Number.POSITIVE_INFINITY)
  const rows = await findProgressRows(assignmentId, problemId, userId)
  const existing = pickProgress(rows)

  if (!existing) return null
  if (existing.completedAt) return existing

  // 暂停全部运行中的记录（含历史重复记录），避免只停一条、另一条继续累加
  await pauseRowsAt(rows, now)

  const refreshed = await findProgressRows(assignmentId, problemId, userId)
  return pickProgress(refreshed) ?? existing
}

/**
 * 终结计时（首次 AC 时调用）
 *
 * 行为：
 *   - 记录不存在 → 返回 null（用户从未打开题目就直接 AC，无计时数据）
 *   - 已完成 → 返回已有的 finalTimeMs（幂等）
 *   - 计时中 → 计算最终用时，置 completedAt=now, finalTimeMs=timeElapsedMs, isPaused=true
 *   - 已暂停 → 直接 finalize，timeElapsedMs 已是最新累计值
 *   - 失联记录只统计到最后活跃时间；同键重复的运行中记录一并暂停
 *
 * 返回：finalTimeMs（ms），若记录不存在或异常则返回 null
 */
export async function finalizeTiming(
  assignmentId: string,
  problemId: string,
  userId: string
): Promise<number | null> {
  try {
    const now = Date.now()
    const rows = await findProgressRows(assignmentId, problemId, userId)
    const existing = pickProgress(rows)

    // 用户从未打开题目：无计时数据
    if (!existing) {
      logger.warn('finalizeTiming: progress 记录不存在', { assignmentId, problemId, userId })
      return null
    }

    // 已完成：幂等返回
    if (existing.completedAt && existing.finalTimeMs != null) {
      return existing.finalTimeMs
    }

    const finalTimeMs = elapsedAt(existing, cutoffFor(existing, now))

    await prisma.classAssignmentProblemProgress.update({
      where: { id: existing.id },
      data: {
        timeElapsedMs: finalTimeMs,
        finalTimeMs,
        completedAt: new Date(now),
        isPaused: true,
        lastResumedAt: null,
        updatedAt: new Date(now),
      },
    })

    // 其它历史重复记录不再保留运行状态
    await pauseRowsAt(
      rows.filter((row) => row.id !== existing.id),
      now
    )

    return finalTimeMs
  } catch (err) {
    logger.error('finalizeTiming 失败', err instanceof Error ? err : new Error(String(err)), {
      assignmentId,
      problemId,
      userId,
    })
    return null
  }
}

/**
 * 心跳：记录客户端仍在当前题目上。
 *
 * - 正常心跳只刷新 updatedAt，不改变累计用时
 * - 若距离上次活跃已超过阈值，说明中间发生过断网/休眠：
 *   按最后活跃时间结算，再从当前时刻恢复，避免把离线时长计入
 * - 已暂停/已完成记录不因心跳恢复
 */
export async function heartbeatTiming(assignmentId: string, problemId: string, userId: string) {
  const now = Date.now()
  const rows = await findProgressRows(assignmentId, problemId, userId)
  const existing = pickProgress(rows)

  if (!existing || existing.completedAt || existing.isPaused || !existing.lastResumedAt) {
    return existing
  }

  if (isStaleRunning(existing, now)) {
    return prisma.classAssignmentProblemProgress.update({
      where: { id: existing.id },
      data: {
        timeElapsedMs: elapsedAt(existing, existing.updatedAt.getTime()),
        isPaused: false,
        lastResumedAt: new Date(now),
        updatedAt: new Date(now),
      },
    })
  }

  return prisma.classAssignmentProblemProgress.update({
    where: { id: existing.id },
    data: { updatedAt: new Date(now) },
  })
}

/**
 * 查询当前进度
 *
 * 返回 progress 记录（含实时累计用时，即如果计时中会包含 lastResumedAt 到 now 的增量）。
 * 失联的运行中记录按最后活跃时间返回暂停态，避免读取时展示无限增长的计时。
 */
export async function getProgress(assignmentId: string, problemId: string, userId: string) {
  const rows = await findProgressRows(assignmentId, problemId, userId)
  const progress = pickProgress(rows)
  if (!progress) return null

  const now = Date.now()
  if (isStaleRunning(progress, now)) {
    return {
      ...progress,
      timeElapsedMs: elapsedAt(progress, progress.updatedAt.getTime()),
      isPaused: true,
      lastResumedAt: null,
    }
  }

  // 若计时中（未暂停且未完成），计算实时累计用时（不写入 DB）
  if (isRunning(progress) && progress.lastResumedAt) {
    const delta = Math.max(0, now - progress.lastResumedAt.getTime())
    return {
      ...progress,
      timeElapsedMs: progress.timeElapsedMs + delta,
    }
  }

  return progress
}
