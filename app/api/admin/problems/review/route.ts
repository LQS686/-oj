/**
 * /api/admin/problems/review - 待审核题目（管理员）
 *
 * 返回 isAiGenerated=false 的题目（用户手动提交 / 教师上传）
 */
import { withApi, ok, throw403, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const problems = await prisma.problem.findMany({
    where: {
      isAiGenerated: false, // 仅展示手动提交的题目
    },
    include: {
      testCases: {
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ data: problems })
})
