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
 * 缓存策略：
 *   - progress 记录走 DB（避免 stale），CacheKeys.timing 仅用于后续 Phase 扩展
 *   - 已完成题目（completedAt != null）不再计时，仅展示最终用时
 *
 * Phase 2+ 预留：
 *   - getEffectiveTimeThresholds / calculateTimeMultiplier 当前不调用，
 *     为后续奖励发放功能（grantFirstAcRewards）准备。
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/* ============================================================================
 * 类型定义
 * ========================================================================== */

export interface TimeThresholds {
  gold?: number   // 金档用时阈值（ms），<=gold 倍率 1.3
  silver?: number // 银档阈值（ms），<=silver 倍率 1.0
  bronze?: number // 铜档阈值（ms），<=bronze 倍率 0.8
}

export interface ProblemRewardConfig {
  difficulty?: string | null
  expReward?: number | null
  coinReward?: number | null
  timeThresholds?: TimeThresholds | null
}

export interface AssignmentProblemRewardConfig {
  expReward?: number | null
  coinReward?: number | null
  timeThresholds?: TimeThresholds | null
}

export interface AssignmentRewardConfig {
  unifiedExpReward?: number | null
  unifiedCoinReward?: number | null
  unifiedTimeThresholds?: TimeThresholds | null
}

export type TimeMultiplierTier = 'gold' | 'silver' | 'bronze' | 'overtime'

export interface TimeMultiplierResult {
  tier: TimeMultiplierTier
  multiplier: number
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
 *
 * 幂等性：多次调用安全，不会累加错误时间
 */
export async function startOrResumeTiming(
  assignmentId: string,
  problemId: string,
  userId: string
) {
  const existing = await prisma.classAssignmentProblemProgress.findUnique({
    where: {
      assignmentId_problemId_userId: { assignmentId, problemId, userId },
    },
  })

  // 已完成：不重启计时
  if (existing?.completedAt) {
    return existing
  }

  if (!existing) {
    // 首次打开：创建新记录
    return prisma.classAssignmentProblemProgress.create({
      data: {
        assignmentId,
        problemId,
        userId,
        timeStarted: new Date(),
        lastResumedAt: new Date(),
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
        lastResumedAt: new Date(),
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
 */
export async function pauseTiming(
  assignmentId: string,
  problemId: string,
  userId: string
) {
  const existing = await prisma.classAssignmentProblemProgress.findUnique({
    where: {
      assignmentId_problemId_userId: { assignmentId, problemId, userId },
    },
  })

  if (!existing) return null
  if (existing.completedAt) return existing
  if (existing.isPaused || !existing.lastResumedAt) return existing

  const now = Date.now()
  const lastResumed = existing.lastResumedAt.getTime()
  const delta = Math.max(0, now - lastResumed) // 防止时钟回拨导致负值

  return prisma.classAssignmentProblemProgress.update({
    where: { id: existing.id },
    data: {
      timeElapsedMs: existing.timeElapsedMs + delta,
      isPaused: true,
      lastResumedAt: null,
    },
  })
}

/**
 * 终结计时（首次 AC 时调用）
 *
 * 行为：
 *   - 记录不存在 → 返回 null（用户从未打开题目就直接 AC，无计时数据）
 *   - 已完成 → 返回已有的 finalTimeMs（幂等）
 *   - 计时中 → 计算最终用时，置 completedAt=now, finalTimeMs=timeElapsedMs, isPaused=true
 *   - 已暂停 → 直接 finalize，timeElapsedMs 已是最新累计值
 *
 * 返回：finalTimeMs（ms），若记录不存在或异常则返回 null
 */
export async function finalizeTiming(
  assignmentId: string,
  problemId: string,
  userId: string
): Promise<number | null> {
  try {
    const existing = await prisma.classAssignmentProblemProgress.findUnique({
      where: {
        assignmentId_problemId_userId: { assignmentId, problemId, userId },
      },
    })

    // 用户从未打开题目：无计时数据
    if (!existing) {
      logger.warn('finalizeTiming: progress 记录不存在', { assignmentId, problemId, userId })
      return null
    }

    // 已完成：幂等返回
    if (existing.completedAt && existing.finalTimeMs != null) {
      return existing.finalTimeMs
    }

    const now = new Date()
    let finalTimeMs = existing.timeElapsedMs

    // 若当前在计时中（未暂停），累加最后一段
    if (!existing.isPaused && existing.lastResumedAt) {
      const delta = Math.max(0, now.getTime() - existing.lastResumedAt.getTime())
      finalTimeMs = existing.timeElapsedMs + delta
    }

    await prisma.classAssignmentProblemProgress.update({
      where: { id: existing.id },
      data: {
        timeElapsedMs: finalTimeMs,
        finalTimeMs,
        completedAt: now,
        isPaused: true,
        lastResumedAt: null,
      },
    })

    return finalTimeMs
  } catch (err) {
    logger.error(
      'finalizeTiming 失败',
      err instanceof Error ? err : new Error(String(err)),
      { assignmentId, problemId, userId }
    )
    return null
  }
}

/**
 * 查询当前进度
 *
 * 返回 progress 记录（含实时累计用时，即如果计时中会包含 lastResumedAt 到 now 的增量）
 */
export async function getProgress(
  assignmentId: string,
  problemId: string,
  userId: string
) {
  const progress = await prisma.classAssignmentProblemProgress.findUnique({
    where: {
      assignmentId_problemId_userId: { assignmentId, problemId, userId },
    },
  })

  if (!progress) return null

  // 若计时中（未暂停且未完成），计算实时累计用时（不写入 DB）
  if (!progress.isPaused && progress.lastResumedAt && !progress.completedAt) {
    const delta = Math.max(0, Date.now() - progress.lastResumedAt.getTime())
    return {
      ...progress,
      timeElapsedMs: progress.timeElapsedMs + delta,
    }
  }

  return progress
}

/* ============================================================================
 * 奖励配置解析（Phase 2+ 预留，本阶段不调用）
 * ========================================================================== */

/**
 * 解析有效用时阈值（四级优先级）
 *
 * 优先级：
 *   1. assignmentProblem.timeThresholds（作业内单题覆盖）
 *   2. assignment.unifiedTimeThresholds（作业统一配置）
 *   3. problem.timeThresholds（题目自身配置）
 *   4. DIFFICULTY_TIME_THRESHOLDS[problem.difficulty]（难度默认）
 *
 * 注：本函数为 Phase 2+ 奖励发放预留，Phase 1 不实际调用。
 */
export function getEffectiveTimeThresholds(
  problem: ProblemRewardConfig,
  assignmentProblem?: AssignmentProblemRewardConfig | null,
  assignment?: AssignmentRewardConfig | null
): TimeThresholds {
  // 1. 作业内单题覆盖
  if (assignmentProblem?.timeThresholds) {
    return assignmentProblem.timeThresholds
  }
  // 2. 作业统一配置
  if (assignment?.unifiedTimeThresholds) {
    return assignment.unifiedTimeThresholds
  }
  // 3. 题目自身配置
  if (problem.timeThresholds) {
    return problem.timeThresholds
  }
  // 4. 难度默认值（Phase 2+ 在 constants.ts 中定义，此处返回空对象作为占位）
  return getDifficultyDefaultThresholds(problem.difficulty || '')
}

/**
 * 根据用时计算倍率
 *
 * 档位：
 *   - gold     (<=gold 阈值)   → 1.3
 *   - silver   (<=silver 阈值) → 1.0
 *   - bronze   (<=bronze 阈值) → 0.8
 *   - overtime (超出 bronze)    → 0.6
 *
 * 注：本函数为 Phase 2+ 奖励发放预留，Phase 1 不实际调用。
 */
export function calculateTimeMultiplier(
  timeElapsedMs: number,
  thresholds: TimeThresholds
): TimeMultiplierResult {
  const { gold, silver, bronze } = thresholds

  if (gold != null && timeElapsedMs <= gold) {
    return { tier: 'gold', multiplier: 1.3 }
  }
  if (silver != null && timeElapsedMs <= silver) {
    return { tier: 'silver', multiplier: 1.0 }
  }
  if (bronze != null && timeElapsedMs <= bronze) {
    return { tier: 'bronze', multiplier: 0.8 }
  }
  return { tier: 'overtime', multiplier: 0.6 }
}

/* ============================================================================
 * 内部辅助
 * ========================================================================== */

/**
 * 难度默认用时阈值（Phase 2+ 由 constants.ts 提供，此处硬编码占位）
 *
 * 单位：ms
 *   - 入门：     gold=60s,   silver=180s,  bronze=600s
 *   - 普及-：    gold=120s,  silver=300s,  bronze=900s
 *   - 普及：     gold=180s,  silver=600s,  bronze=1800s
 *   - 普及+：    gold=300s,  silver=900s,  bronze=2700s
 *   - 提高：     gold=600s,  silver=1800s, bronze=3600s
 *   - 提高+：    gold=900s,  silver=2700s, bronze=5400s
 *   - 省选：     gold=1800s, silver=3600s, bronze=7200s
 *   - NOI：      gold=3600s, silver=7200s, bronze=14400s
 */
function getDifficultyDefaultThresholds(difficulty: string): TimeThresholds {
  const SEC = 1000
  const MIN = 60 * SEC
  const map: Record<string, TimeThresholds> = {
    '入门': { gold: 1 * MIN, silver: 3 * MIN, bronze: 10 * MIN },
    '普及-': { gold: 2 * MIN, silver: 5 * MIN, bronze: 15 * MIN },
    '普及': { gold: 3 * MIN, silver: 10 * MIN, bronze: 30 * MIN },
    '普及+': { gold: 5 * MIN, silver: 15 * MIN, bronze: 45 * MIN },
    '提高': { gold: 10 * MIN, silver: 30 * MIN, bronze: 60 * MIN },
    '提高+': { gold: 15 * MIN, silver: 45 * MIN, bronze: 90 * MIN },
    '省选': { gold: 30 * MIN, silver: 60 * MIN, bronze: 120 * MIN },
    'NOI': { gold: 60 * MIN, silver: 120 * MIN, bronze: 240 * MIN },
  }
  return map[difficulty] || { gold: 5 * MIN, silver: 15 * MIN, bronze: 45 * MIN }
}
