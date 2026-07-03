/**
 * /api/admin/logs/source-changes - 题目来源变更审计日志（管理员）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listProblemSourceChangeLogs } from '@/lib/admin/logs'

export const GET = withApi.admin(async () => {
  const data = await listProblemSourceChangeLogs()
  return ok(data)
})
