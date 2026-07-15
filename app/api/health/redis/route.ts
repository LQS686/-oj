/**
 * /api/health/redis - Redis readiness probe
 *
 * 验证 Redis 连接可用性。docker-compose healthcheck / k8s readinessProbe 使用。
 */
import { ok, fail } from '@/lib/api/withApi'
import { getRedisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const client = getRedisClient()
    if (!client) {
      return fail('REDIS_UNAVAILABLE', 'Redis 客户端未初始化', 503)
    }
    const start = Date.now()
    const pong = await client.ping()
    const latencyMs = Date.now() - start
    if (pong !== 'PONG') {
      return fail('REDIS_PING_FAILED', `PING 返回非预期: ${pong}`, 503)
    }
    return ok({ status: 'ok', latencyMs, timestamp: Date.now() })
  } catch (e) {
    return fail('REDIS_ERROR', e instanceof Error ? e.message : String(e), 503)
  }
}