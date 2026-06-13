/**
 * /api/admin/logs/source-changes - 题目来源变更审计日志（管理员）
 */
import { withApi, ok, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/logs/source-changes
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'UPDATE_PROBLEM_SOURCE',
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // Limit to last 100 logs
  })

  return ok({ data: logs })
})
