/**
 * 题目统计：状态分布、语言分布、AC 率、近 7 天趋势、AC 平均耗时/内存
 * GET /api/problems/[id]/stats
 *
 * 公开接口（题目本身是公开的，统计聚合不暴露个人提交信息）。
 *
 * URL 参数 [id] 支持两种形式：
 *   - MongoDB ObjectId（24 字符 hex）
 *   - problemNumber（如 "P1001"）
 *
 * 直接对非 ObjectId 字符串调用 findUnique({ where: { id } }) 会触发
 * "Malformed ObjectID" 错误，因此用 isObjectIdLike 区分查询字段。
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getProblemStats } from '@/lib/problem/stats'
import { prisma } from '@/lib/prisma'
import { isObjectIdLike } from '@/lib/problem/lookup'

export const GET = withApi.public(async (_req, ctx) => {
  const { id } = ctx.params
  if (!id) throw400('INVALID_ID', '无效的题目ID')

  // 题目 ID 可能是 MongoDB ObjectId（24 字符 hex）或 problemNumber（如 "P1001"）
  const problemWhere: { id: string } | { problemNumber: string } = isObjectIdLike(id)
    ? { id }
    : { problemNumber: id }

  // 校验题目存在（避免返回空统计误导前端）
  const exists = await prisma.problem.findFirst({
    where: problemWhere,
    select: { id: true },
  })
  if (!exists) throw404('题目不存在')
  // throw404 返回 never，TS 已收窄 exists 为非空类型
  const safeExists = exists!

  // getProblemStats 内部按 ObjectId 聚合 Submission，必须传真正的 ObjectId
  const stats = await getProblemStats(safeExists.id)
  if (!stats) throw404('题目不存在')

  return ok(stats)
})
