/**
 * 评测运行时配置解析。
 * 优先级：环境变量（显式设置）→ 系统设置 DB/内存缓存 → 硬编码默认值。
 * 运维可在 Docker/.env 覆盖后台配置；后台改动能热更新队列并发与超时。
 */
import { cpus } from 'os'
import { getSystemSettingsSync } from '@/lib/settings'
import {
  defaultJudgeSettings,
  mergeJudgeSettings,
  normalizeFailFast,
  type FailFastMode,
  type JudgeSettings,
} from '@/lib/settings-defaults'
import { logger } from '@/lib/logger'

export type { FailFastMode }

export interface ResolvedJudgeConfig {
  jobTimeoutMs: number
  failFast: FailFastMode
  maxConcurrent: number
  caseConcurrency: number
  largeCaseConcurrency: number
  rejudgeTimes: number
  extraTimeRatio: number
  compileTimeoutMs: number
  ioSlackMaxMs: number
  deadCheckMs: number
  closeFallbackMs: number
  largeCaseBytes: number
}

function envNumber(key: string): number | undefined {
  const v = process.env[key]
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function envString(key: string): string | undefined {
  const v = process.env[key]
  if (v === undefined || v === '') return undefined
  return v
}

function dbJudge(): JudgeSettings {
  try {
    const s = getSystemSettingsSync()
    return mergeJudgeSettings(s.judge)
  } catch {
    return { ...defaultJudgeSettings }
  }
}

/** 解析当前生效的评测配置（同步，供热路径使用） */
export function getJudgeConfig(): ResolvedJudgeConfig {
  const db = dbJudge()

  const jobTimeoutSec = Math.min(
    3600,
    Math.max(30, envNumber('JUDGE_JOB_TIMEOUT') ?? db.jobTimeout),
  )
  const failFast = normalizeFailFast(envString('JUDGE_FAIL_FAST') ?? db.failFast)
  const maxConcurrent = Math.min(
    16,
    Math.max(1, Math.round(envNumber('JUDGE_MAX_CONCURRENT') ?? db.maxConcurrent)),
  )

  const caseFromEnv = envNumber('JUDGE_CASE_CONCURRENCY')
  let caseConcurrency: number
  if (caseFromEnv !== undefined && caseFromEnv >= 1) {
    caseConcurrency = Math.min(16, Math.round(caseFromEnv))
  } else if (db.caseConcurrency >= 1) {
    caseConcurrency = Math.min(16, db.caseConcurrency)
  } else {
    const n = cpus()?.length || 4
    // 容器内 os.cpus() 读到的是宿主机核数，会高估可用核（docker-compose 限 cpus:"3"）。
    // 留 1 核给 Next.js 主进程与编译，4 核部署推荐 caseConcurrency=2。
    caseConcurrency = Math.min(8, Math.max(2, n - 1))
  }

  const largeCaseConcurrency = Math.min(
    8,
    Math.max(
      1,
      Math.round(envNumber('JUDGE_LARGE_CASE_CONCURRENCY') ?? db.largeCaseConcurrency),
    ),
  )

  const rejudgeTimes = Math.min(
    5,
    Math.max(0, Math.round(envNumber('JUDGE_REJUDGE_TIMES') ?? db.rejudgeTimes)),
  )
  const extraTimeRatio = Math.min(
    1,
    Math.max(0, envNumber('JUDGE_EXTRA_TIME_RATIO') ?? db.extraTimeRatio),
  )
  const compileTimeoutMs = Math.min(
    120000,
    Math.max(5000, Math.round(envNumber('JUDGE_COMPILE_TIMEOUT') ?? db.compileTimeout)),
  )
  const ioSlackMaxMs = Math.min(
    120000,
    Math.max(5000, Math.round(envNumber('JUDGE_IO_SLACK_MAX_MS') ?? db.ioSlackMaxMs)),
  )
  const deadCheckMs = Math.min(
    30000,
    Math.max(2000, Math.round(envNumber('JUDGE_DEAD_CHECK_MS') ?? db.deadCheckMs)),
  )
  const closeFallbackMs = Math.min(
    2000,
    Math.max(200, Math.round(envNumber('JUDGE_CLOSE_FALLBACK_MS') ?? db.closeFallbackMs)),
  )
  const largeCaseBytes = Math.max(
    256 * 1024,
    Math.round(envNumber('JUDGE_LARGE_CASE_BYTES') ?? db.largeCaseBytes),
  )

  return {
    jobTimeoutMs: jobTimeoutSec * 1000,
    failFast,
    maxConcurrent,
    caseConcurrency,
    largeCaseConcurrency,
    rejudgeTimes,
    extraTimeRatio,
    compileTimeoutMs,
    ioSlackMaxMs,
    deadCheckMs,
    closeFallbackMs,
    largeCaseBytes,
  }
}

export type JudgeQueueRuntimePatch = {
  maxConcurrent: number
  jobTimeoutMs: number
  deadCheckMs: number
}

type QueueRuntimeApplier = (patch: JudgeQueueRuntimePatch) => void

let queueRuntimeApplier: QueueRuntimeApplier | null = null

/** 由 queue 模块注册，避免 config ↔ queue 循环依赖与 ESM require */
export function registerJudgeQueueRuntimeApplier(fn: QueueRuntimeApplier): void {
  queueRuntimeApplier = fn
}

/**
 * 将当前配置应用到评测队列（并发、超时、死任务扫描）。
 * 由 saveSystemSettings / 启动预热调用。
 */
export function applyJudgeRuntimeConfig(): void {
  const cfg = getJudgeConfig()
  try {
    queueRuntimeApplier?.({
      maxConcurrent: cfg.maxConcurrent,
      jobTimeoutMs: cfg.jobTimeoutMs,
      deadCheckMs: cfg.deadCheckMs,
    })
    logger.info('评测运行时配置已应用', {
      maxConcurrent: cfg.maxConcurrent,
      jobTimeoutSec: cfg.jobTimeoutMs / 1000,
      failFast: cfg.failFast,
      deadCheckMs: cfg.deadCheckMs,
      caseConcurrency: cfg.caseConcurrency,
    })
  } catch (e) {
    logger.warn('applyJudgeRuntimeConfig：队列尚未就绪或应用失败', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
