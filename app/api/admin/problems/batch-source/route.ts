/**
 * /api/admin/problems/batch-source - 批量更新题目的来源标记（管理员）
 */
import { withApi, ok, readJson, throw400, throw403, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const { ids, source } = await readJson<{ ids?: string[]; source?: string }>(req)

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw400('INVALID_IDS', '未选择题目')
  }

  if (!['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].includes(source!)) {
    throw400('INVALID_SOURCE', '无效的来源标记')
  }

  // Update
  const result = await prisma.problem.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      aiStatus: source,
    },
  })

  // Create Audit Log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'UPDATE_PROBLEM_SOURCE',
      resource: 'problems',
      details: {
        count: result.count,
        targetSource: source,
        problemIds: ids,
      },
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    },
  })

  return ok({
    message: `成功更新 ${result.count} 个题目的来源标记`,
  })
})
