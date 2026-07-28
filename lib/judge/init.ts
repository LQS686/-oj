/**
 * 评测系统初始化
 * 在应用启动时导入此模块以启动 Worker
 */

import { logger } from '@/lib/logger'

async function bootJudgeSystem() {
  // 先加载队列以注册 runtime applier，再预热 DB 设置并热更新
  await import('./queue')

  try {
    const { warmSystemSettingsCache } = await import('@/lib/settings')
    await warmSystemSettingsCache()
    const { applyJudgeRuntimeConfig } = await import('./config')
    applyJudgeRuntimeConfig()
  } catch (e) {
    logger.warn('评测设置预热失败，将使用默认值/环境变量', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 启动时预编译 dsoj-watch，避免首波并行测点竞态截断二进制 → 误报 RE（WSL npm run dev 尤其如此）
  try {
    const { ensureDsojWatchBinary } = await import('./ensure-watch')
    ensureDsojWatchBinary()
  } catch (e) {
    logger.warn('预编译 dsoj-watch 失败，评测将按需编译或回退 bash', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  await import('./worker')
  logger.info('评测系统已初始化')
}

void bootJudgeSystem()

export {}
