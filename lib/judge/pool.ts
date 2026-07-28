import { getJudgeConfig } from './config'
import type { FailFastMode } from '@/lib/settings-defaults'

export type { FailFastMode }

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

/** 小测点默认并行度（系统设置 / env / CPU 自动） */
export function resolveCaseConcurrency(): number {
  return getJudgeConfig().caseConcurrency
}

/**
 * 大 I/O 测点并行度（默认 2）。
 * LP3383 类题目：8 路同时读超大输入会把磁盘打满，墙钟反而变慢。
 */
export function resolveLargeCaseConcurrency(): number {
  return getJudgeConfig().largeCaseConcurrency
}

/** 输入或输出超过该字节数视为「大测点」 */
export function resolveLargeCaseBytes(): number {
  return getJudgeConfig().largeCaseBytes
}

/**
 * 正式评测 fail-fast（默认关闭）：OI 全量计分需跑完全部测点。
 * - off（默认）：跑完全部测点
 * - hard：TLE/MLE/RE/OLE/CSP/SE 后不再领新测点，并 abort 在跑进程
 * - all：任意非 AC 即停（类 ACM）
 *
 * 整单超时（JUDGE_JOB_TIMEOUT）始终会 abort，与 fail-fast 无关。
 */
export function resolveFailFastMode(): FailFastMode {
  return getJudgeConfig().failFast
}

const HARD_FAIL_STATUSES = new Set(['TLE', 'MLE', 'RE', 'OLE', 'CSP', 'SE'])

export function shouldFailFast(status: string, mode: FailFastMode): boolean {
  if (mode === 'off') return false
  // PC（Special Judge 部分分）继续跑后续测点以累计总分
  if (status === 'PC' || status === 'AC') return false
  if (mode === 'all') return true
  return HARD_FAIL_STATUSES.has(status)
}
