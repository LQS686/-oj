/**
 * lib/build-info.ts
 *
 * 构建与运行环境信息收集（参考 Hydro loader.ts 的版本注入机制）。
 * 启动时一次性采集，避免每次 /api/health 请求都 spawn 子进程。
 *
 * 暴露字段：
 *   - gitHash：HEAD 短 commit hash（如 "abc1234"），获取失败为 "unknown"
 *   - gitDirty：工作区是否有未提交改动（true/false）
 *   - nodeVersion：Node.js 版本（如 "v20.11.0"）
 *   - platform：操作系统平台
 *   - arch：CPU 架构
 *   - startTime：进程启动时间戳（ms）
 *   - env：NODE_ENV 值
 */
import { execSync } from 'child_process'
import { logger } from '@/lib/logger'

interface BuildInfo {
  gitHash: string
  gitDirty: boolean
  nodeVersion: string
  platform: string
  arch: string
  startTime: number
  env: string
}

let cachedInfo: BuildInfo | null = null

/**
 * 采集构建信息。失败时降级为 "unknown"，不抛错。
 * 仅在首次调用时执行 git 命令，后续直接返回缓存。
 */
export function getBuildInfo(): BuildInfo {
  if (cachedInfo) return cachedInfo

  let gitHash = 'unknown'
  let gitDirty = false

  try {
    // 短 commit hash（HEAD）
    gitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    // 检测工作区是否 dirty（有未提交改动）
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    gitDirty = status.length > 0
  } catch (err) {
    // git 命令失败（非 git 仓库 / git 未安装 / CI 浅克隆）：降级为 unknown
    logger.debug('[build-info] git 信息采集失败', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  cachedInfo = {
    gitHash,
    gitDirty,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    startTime: Date.now(),
    env: process.env.NODE_ENV || 'development',
  }
  return cachedInfo
}

/**
 * 格式化启动 banner 日志（一行式，便于日志聚合）。
 */
export function formatStartupBanner(): string {
  const info = getBuildInfo()
  const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
  const dirtyMark = info.gitDirty ? '-dirty' : ''
  return `[build] git=${info.gitHash}${dirtyMark} node=${info.nodeVersion} platform=${info.platform}/${info.arch} env=${info.env} rss=${memMB}MB`
}
