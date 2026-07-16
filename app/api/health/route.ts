/**
 * /api/health - Liveness probe
 *
 * 不依赖 DB / Redis。容器编排层（k8s livenessProbe / docker-compose healthcheck）
 * 用此判断进程是否还活着。失败时应重启容器。
 *
 * 修复（2026-07）：之前此文件缺失，wget healthcheck 收到 404，
 *   容器持续标记为 unhealthy。
 */
import { ok } from '@/lib/api/withApi'

export const dynamic = 'force-dynamic'

export async function GET() {
  return ok({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  })
}