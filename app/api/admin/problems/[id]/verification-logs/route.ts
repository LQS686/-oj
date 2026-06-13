/**
 * /api/admin/problems/[id]/verification-logs - 题目验证日志（管理员）
 */
import { withApi, ok, throw403, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params

  const logs = await prisma.verificationLog.findMany({
    where: { problemId: id },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ data: logs })
})
