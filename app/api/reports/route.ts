/**
 * /api/reports - 内容举报（登录用户）
 *
 * POST 鉴权：创建举报
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { createReport } from '@/lib/report/service'
import { isObjectId } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
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
