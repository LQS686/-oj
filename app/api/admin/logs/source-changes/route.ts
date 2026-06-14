/**
 * /api/admin/logs/source-changes - 题目来源变更审计日志（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import { listProblemSourceChangeLogs } from '@/lib/admin/logs'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }
  const data = await listProblemSourceChangeLogs()
  return ok(data)
})
