/**
 * /api/health - Liveness probe
 *
 * 不依赖 DB / Redis。容器编排层用此判断进程是否还活着。
 * 对外仅返回存活状态与粗粒度运行时指标，不暴露 build/git 元信息。
 */
import { ok } from '@/lib/api/withApi'

export const dynamic = 'force-dynamic'

export async function GET() {
  const memUsage = process.memoryUsage()
  return ok({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    runtime: {
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
  })
}
