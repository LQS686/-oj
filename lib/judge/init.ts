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

  // 启动自检：测点磁盘缓存目录（data/testdata）必须可写。
  // 容器部署时若挂载卷属主为 root（首次挂载常见），评测进程（nextjs uid=1001）写入缓存会失败，
  // 导致 materializeTestCaseToDisk 每次回源 Mongo 拉取大测点字符串 → 百万行测点性能异常。
  // 此处仅告警不阻断，便于日志直接暴露该部署问题。
  try {
    const { mkdir, access, constants, writeFile, unlink } = await import('fs/promises')
    const { join } = await import('path')
    const testdataDir = join(process.cwd(), 'data', 'testdata')
    await mkdir(testdataDir, { recursive: true })
    await access(testdataDir, constants.W_OK)
    const probe = join(testdataDir, `.writeprobe_${process.pid}`)
    await writeFile(probe, 'ok')
    await unlink(probe)
  } catch (e) {
    logger.warn('⚠️ 测点磁盘缓存目录 data/testdata 不可写：评测将每次回源数据库，大测点性能异常。', {
      error: e instanceof Error ? e.message : String(e),
      fix: '容器部署请执行: docker compose exec -u root app chown -R 1001:1001 /app/data （bt-deploy.sh 会自动修复）',
    })
  }

  await import('./worker')
  logger.info('评测系统已初始化')
}

void bootJudgeSystem()

export {}
