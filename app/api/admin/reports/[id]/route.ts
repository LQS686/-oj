/**
 * /api/admin/reports/[id] - 举报处理（管理员）
 *
 * PATCH 鉴权（管理员）：标记已处理 / 驳回，可选删除被举报内容
 */
import { withApi, ok, readJson, throw400, throw404, ApiError } from '@/lib/api/withApi'
import { handleReport, type ReportHandleAction } from '@/lib/report/service'
import { isObjectId } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

const VALID_STATUS = new Set<ReportHandleAction>(['resolved', 'dismissed'])

export const PATCH = withApi.admin(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的举报ID')

  const body = await readJson<{
    status?: string
    handleNote?: string
    deleteTarget?: boolean
  }>(req)
  const status = body.status as ReportHandleAction
  if (!status || !VALID_STATUS.has(status)) {
    throw400('VALIDATION', '无效的处理状态')
  }

  try {
    const updated = await handleReport(id, user.id, {
      status,
      handleNote: body.handleNote,
      deleteTarget: body.deleteTarget === true,
    })
    return ok(updated)
  } catch (err: unknown) {
    logger.error('处理举报失败', err)
    if (err instanceof ApiError && err.status === 404) throw404('举报记录不存在')
    throw err
  }
})
