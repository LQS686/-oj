/**
 * 题目统计：状态分布、语言分布、AC 率、近 7 天趋势、AC 平均耗时/内存
 * GET /api/problems/[id]/stats
 *
 * 公开接口（题目本身是公开的，统计聚合不暴露个人提交信息）。
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getProblemStats } from '@/lib/problem/stats'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (_req, ctx) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  // 校验题目存在（避免返回空统计误导前端）
  const exists = await prisma.problem.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!exists) throw404('题目不存在')

  const stats = await getProblemStats(id)
  if (!stats) throw404('题目不存在')

  return ok(stats)
})
