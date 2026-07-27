import { cpus } from 'os'

/**
 * 有限并发池：结果下标与输入一致（单线程调度，await 点可穿插）。
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const runWorker = async () => {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: n }, () => runWorker()))
  return results
}

/** 小测点默认并行度 */
export function resolveCaseConcurrency(): number {
  const fromEnv = parseInt(process.env.JUDGE_CASE_CONCURRENCY || '', 10)
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(16, fromEnv)
  }
  const n = cpus()?.length || 4
  return Math.min(8, Math.max(4, n))
}

/**
 * 大 I/O 测点并行度（默认 2）。
 * LP3383 类题目：8 路同时读超大输入会把磁盘打满，墙钟反而变慢。
 */
export function resolveLargeCaseConcurrency(): number {
  const fromEnv = parseInt(process.env.JUDGE_LARGE_CASE_CONCURRENCY || '', 10)
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(8, fromEnv)
  }
  return 2
}

/** 输入或输出超过该字节数视为「大测点」 */
export const LARGE_CASE_BYTES = Math.max(
  256 * 1024,
  parseInt(process.env.JUDGE_LARGE_CASE_BYTES || `${2 * 1024 * 1024}`, 10) || 2 * 1024 * 1024
)

/**
 * 正式评测 fail-fast（已默认关闭）：产品要求任何情况下跑完全部测点。
 * - off（默认）：跑完全部测点（OI 全量计分）
 * - hard：TLE/MLE/RE/OLE/CSP/SE 后不再领新测点，并 abort 在跑进程
 * - all：任意非 AC 即停（类 ACM）
 *
 * 仅当显式设置 JUDGE_FAIL_FAST=hard|all 时启用；默认与未设置均为 off。
 */
export type FailFastMode = 'off' | 'hard' | 'all'

export function resolveFailFastMode(): FailFastMode {
  const raw = (process.env.JUDGE_FAIL_FAST || 'off').trim().toLowerCase()
  if (raw === 'hard') return 'hard'
  if (raw === 'all' || raw === 'any') return 'all'
  // off / 0 / false / no / 空 / 其它 → 全量跑完
  return 'off'
}

const HARD_FAIL_STATUSES = new Set(['TLE', 'MLE', 'RE', 'OLE', 'CSP', 'SE'])

export function shouldFailFast(status: string, mode: FailFastMode): boolean {
  if (mode === 'off') return false
  if (mode === 'all') return status !== 'AC'
  return HARD_FAIL_STATUSES.has(status)
}
