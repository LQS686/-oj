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

  // 启动自检：bubblewrap（bwrap）命名空间隔离可用性。
  // 云评测镜像已内置 bubblewrap，评测由 runner.sh 走命名空间隔离（mount/pid/net 等）；
  // Docker 容器默认 seccomp 会阻止创建 userns（"No permissions to create new namespace"），
  // 已通过 ./seccomp-oj.json 放行；此处功能探测确认配置生效，不可用则告警暴露配置/内核问题。
  try {
    const { spawnSync } = await import('node:child_process')
    const probe = spawnSync(
      'bwrap',
      ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--unshare-all', '--die-with-parent', '--new-session', 'true'],
      { encoding: 'utf8', timeout: 5000 },
    )
    if (probe.error || probe.status !== 0) {
      logger.warn('⚠️ bubblewrap 命名空间隔离不可用：评测沙箱无法创建用户命名空间。', {
        detail: (probe.stderr || '').trim() || (probe.error ? probe.error.message : `exit ${probe.status}`),
        fix: '容器部署请确认 docker-compose.yml 已引用 ./seccomp-oj.json（放行 unshare/userns），且宿主内核允许非特权 userns（sysctl kernel.unprivileged_userns_clone=1）；本地 WSL 可 sudo apt install bubblewrap 启用。',
      })
    }
  } catch (e) {
    logger.warn('检测 bubblewrap 失败，沙箱隔离状态未知', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  await import('./worker')
  logger.info('评测系统已初始化')
}

void bootJudgeSystem()

export {}
