/**
 * /api/health/redis - Redis 健康检查（仅管理员，与 /api/health/db 一致）
 *
 * 验证 Redis 连接可用性。A-P2-9 修复：不再对匿名用户公开，避免暴露内部服务状态；
 * 仅管理员可访问（docker-compose healthcheck / k8s readinessProbe 需自带鉴权）。
 */
import { withApi, ok, fail } from '@/lib/api/withApi'
import { getRedisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export const GET = withApi.admin(async () => {
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
})