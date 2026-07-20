/**
 * /api/health - Liveness probe
 *
 * 不依赖 DB / Redis。容器编排层（k8s livenessProbe / docker-compose healthcheck）
 * 用此判断进程是否还活着。失败时应重启容器。
 *
 * 修复（2026-07）：之前此文件缺失，wget healthcheck 收到 404，
 *   容器持续标记为 unhealthy。
 *
 * 优化（参考 Hydro loader.ts）：返回 git hash + Node 版本 + 内存信息，
 *   便于运维诊断与版本核对。读取缓存中的 build-info，不引入额外开销。
 */
import { ok } from '@/lib/api/withApi'
import { getBuildInfo } from '@/lib/build-info'

export const dynamic = 'force-dynamic'

export async function GET() {
  const info = getBuildInfo()
  const memUsage = process.memoryUsage()
  return ok({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    build: {
      gitHash: info.gitHash,
      gitDirty: info.gitDirty,
      nodeVersion: info.nodeVersion,
      platform: info.platform,
      arch: info.arch,
      env: info.env,
    },
    runtime: {
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
  })
}