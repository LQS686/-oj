/**
 * lib/judge/memory-gate.ts
 * 评测内存门控：宿主/容器内存压力过大时暂停派发新评测，防止 OOM 连锁。
 *
 * 风险背景（4G 宿主：app 2.5g + mongo 1g + redis 256m + 系统 ≈ 超载）：
 *   - 宿主内存耗尽 → 内核 OOM killer 可能误杀 mongo/app（大面积评测失败）
 *   - app 容器 cgroup 内存超限 → cgroup OOM killer 杀评测进程（误判 RE/MLE）
 * 本模块在评测队列派发前做双重检查：
 *   1. 宿主可用内存（/proc/meminfo MemAvailable，Docker 容器默认可见宿主值）
 *   2. app 容器自身 cgroup 内存使用率（/sys/fs/cgroup/memory.current / memory.max）
 * 任一指标异常 → 暂停派发，等内存恢复后再继续；指标读不到（非 Linux / 非 cgroup v2）→ 放行。
 */
import 'server-only'
import { readFileSync } from 'fs'
import { logger } from '@/lib/logger'

/** 宿主可用内存下限（MB）：低于该值暂停派发新评测；可用 JUDGE_MIN_FREE_MEM_MB 覆盖 */
const MIN_FREE_HOST_MB = (() => {
  const v = Number(process.env.JUDGE_MIN_FREE_MEM_MB)
  return Number.isFinite(v) && v > 0 ? v : 512
})()

/** app 容器 cgroup 内存使用率上限（0-1），超过即暂停派发 */
const MAX_APP_MEM_RATIO = 0.9

/**
 * 宿主可用内存（MB）。
 * Docker 容器默认 /proc/meminfo 展示宿主内存（无 lxcfs 虚拟化时），可有效反映宿主压力。
 * 非 Linux / 读取失败返回 null（不阻塞评测）。
 */
export function readHostAvailableMemMB(): number | null {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf-8')
    const m = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m)
    if (!m) return null
    return Math.floor(Number(m[1]) / 1024)
  } catch {
    return null
  }
}

/**
 * app 容器 cgroup v2 内存使用率 [0,1]。
 * 非 cgroup v2（/sys/fs/cgroup 无 memory.max）返回 null。
 */
export function readAppCgroupMemRatio(): number | null {
  try {
    const cur = readFileSync('/sys/fs/cgroup/memory.current', 'utf-8').trim()
    const maxRaw = readFileSync('/sys/fs/cgroup/memory.max', 'utf-8').trim()
    if (maxRaw === 'max') return null
    const curN = Number(cur)
    const maxN = Number(maxRaw)
    if (!Number.isFinite(curN) || !Number.isFinite(maxN) || maxN <= 0) return null
    return curN / maxN
  } catch {
    return null
  }
}

export interface MemoryGateResult {
  ok: boolean
  reason?: string
}

/**
 * 评测内存门控是否放行。
 * 任一指标读不到 → 放行（不因监控缺失阻塞评测）。
 */
export function memoryGateOk(): MemoryGateResult {
  const hostFree = readHostAvailableMemMB()
  if (hostFree !== null && hostFree < MIN_FREE_HOST_MB) {
    return { ok: false, reason: `宿主可用内存不足（${hostFree}MB < ${MIN_FREE_HOST_MB}MB）` }
  }
  const ratio = readAppCgroupMemRatio()
  if (ratio !== null && ratio > MAX_APP_MEM_RATIO) {
    return {
      ok: false,
      reason: `app 容器内存使用率过高（${Math.round(ratio * 100)}% > ${MAX_APP_MEM_RATIO * 100}%）`,
    }
  }
  return { ok: true }
}

/** 供调试/日志：输出当前内存指标 */
export function memorySnapshot(): Record<string, unknown> {
  const hostFree = readHostAvailableMemMB()
  const ratio = readAppCgroupMemRatio()
  return {
    hostAvailableMB: hostFree,
    appCgroupRatio: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    minFreeHostMB: MIN_FREE_HOST_MB,
  }
}

// 启动时记录一次门控配置，便于线上排查评测排队原因
try {
  logger.info('[memory-gate] 评测内存门控配置', {
    ...memorySnapshot(),
    maxAppMemRatio: MAX_APP_MEM_RATIO,
  })
} catch {
  /* ignore */
}
