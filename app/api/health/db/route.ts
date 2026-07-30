/**
 * GET /api/health/db - DB 健康检查（仅管理员）
 *
 * 对外只返回 up/down 与延迟，不暴露副本集拓扑与内部错误细节。
 */
import { NextResponse } from 'next/server'
import { withApi, ok } from '@/lib/api/withApi'
import { getMongoClient } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withApi.admin(async () => {
  try {
    const client = await getMongoClient()
    const db = client.db()

    const pingStart = Date.now()
    await db.command({ ping: 1 })
    const pingTime = Date.now() - pingStart

    return ok({
      status: 'up',
      latency: pingTime,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    logger.error('Health check failed:', error)
    return NextResponse.json(
      {
        status: 'down',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
})
