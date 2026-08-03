/**
 * /api/reports - 内容举报（登录用户）
 *
 * POST 鉴权：创建举报（含频率限制，防刷举报）
 */
import { withApi, ok, fail, readJson, throw400 } from '@/lib/api/withApi'
import { createReport } from '@/lib/report/service'
import { isObjectId } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // 频率限制：举报接口防刷（用户 + IP 维度，5 次/分钟，窗口内超限返回 429）
  const { checkRateLimit, getClientIP } = await import('@/lib/rate-limit')
  const rl = await checkRateLimit(`report:${user.id}:${getClientIP(req)}`, {
    maxRequests: 5,
    windowMs: 60 * 1000,
    keyPrefix: 'report',
  })
  if (!rl.success) {
    return fail('RATE_LIMITED', '举报提交过于频繁，请稍后再试', 429)
  }

  const body = await readJson<{
    targetType: string
    targetId: string
    reason: string
    detail?: string
  }>(req)

  if (!body.targetType) throw400('VALIDATION', '缺少举报类型')
  if (!body.targetId) throw400('VALIDATION', '缺少举报对象')
  if (!body.reason) throw400('VALIDATION', '缺少举报原因')
  if (!isObjectId(body.targetId)) {
    throw400('INVALID_ID', '无效的目标ID')
  }

  try {
    const report = await createReport(
      {
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        detail: body.detail,
      },
      user.id
    )
    return ok(report, { status: 201 })
  } catch (err: unknown) {
    // ApiError 交由 withApi.safeCall 按 code/message/status 统一响应
    logger.error('创建举报失败', err)
    throw err
  }
})
