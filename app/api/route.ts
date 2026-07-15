/**
 * /api/health - Liveness probe
 *
 * 不依赖 DB / Redis。容器编排层（k8s livenessProbe / docker-compose healthcheck）
 * 用此判断进程是否还活着。失败时应重启容器。
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