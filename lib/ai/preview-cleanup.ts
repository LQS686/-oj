/**
 * lib/ai/preview-cleanup.ts
 *
 * Phase 6 Task 27.6: 定时清理超时预览任务
 *
 * 扫描超 24 小时未确认的 COMPLETED + isPreview 任务，自动 commit 入库。
 *
 * 启动方式：
 *   - 在 lib/ai/queue.ts 的 aiQueue 单例首次初始化时调用 startPreviewCleanup()
 *   - 使用 global flag 防止 dev 模式热重载导致重复注册 setInterval
 *   - 也支持外部手动调用（如 instrumentation.ts / 启动钩子）
 *
 * 设计要点：
 *   - 1 小时扫描一次（24 小时超时阈值，1 小时粒度足够及时）
 *   - 失败仅日志，不影响后续扫描
 *   - 使用 dynamic import 避免 queue ↔ service 循环依赖
 */
import { logger } from '@/lib/logger'

const SCAN_INTERVAL_MS = 60 * 60 * 1000 // 1 小时
const CLEANUP_DELAY_MS = 5 * 1000 // 启动后 5 秒再首次执行（避开 dev 启动期 prisma 未就绪）

declare global {
   
  var __aiPreviewCleanupStarted: boolean | undefined
}

/**
 * 启动预览任务定时清理
 *
 * 幂等：多次调用只会真正注册一次 setInterval（通过 global flag 防止 dev 热重载重复）
 */
export function startPreviewCleanup(): void {
  if (global.__aiPreviewCleanupStarted) return
  global.__aiPreviewCleanupStarted = true

  const runCleanup = async () => {
    try {
      // dynamic import 避免循环依赖（service.ts → queue.ts → preview-cleanup.ts → service.ts）
      const { cleanupStalePreviewTasks } = await import('./service')
      const result = await cleanupStalePreviewTasks()
      if (result.committed > 0) {
        logger.info('[ai-preview-cleanup] 本轮清理完成', result)
      }
    } catch (e) {
      logger.warn('[ai-preview-cleanup] 清理失败', { err: e })
    }
  }

  // 启动后延迟执行（避开 dev 启动期 prisma 未就绪）
  setTimeout(() => {
    runCleanup().catch(() => {})
  }, CLEANUP_DELAY_MS)

  setInterval(() => {
    runCleanup().catch(() => {})
  }, SCAN_INTERVAL_MS)

  logger.info('[ai-preview-cleanup] 定时清理任务已启动', {
    intervalMs: SCAN_INTERVAL_MS,
    initialDelayMs: CLEANUP_DELAY_MS,
  })
}
