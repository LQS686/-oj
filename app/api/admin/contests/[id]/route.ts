/**
 * /api/admin/contests/[id] - 管理员单个竞赛操作
 *
 * GET    竞赛详情（含题目列表）
 * PATCH  更新竞赛
 * DELETE 删除竞赛
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminGetContestWithProblems,
  adminUpdateContest,
  adminDeleteContest,
  type AdminUpdateContestInput,
} from '@/lib/contest/service'

/**
 * GET /api/admin/contests/[id] - 获取单个竞赛详情（管理员）
 */
export const GET = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const contest = await adminGetContestWithProblems(id)
  if (!contest) throw404('竞赛不存在')
  return ok(contest)
})

/**
 * PATCH /api/admin/contests/[id] - 更新竞赛（管理员）
 */
export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<AdminUpdateContestInput>(req)
  return ok(await adminUpdateContest(id, body))
})

/**
 * DELETE /api/admin/contests/[id] - 删除竞赛（管理员）
 */
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // schema 中 Contest 子表（ContestProblem / ContestParticipant / Submission.contestId）
  // 均未声明 onDelete: Cascade，级联清理由 adminDeleteContest 在事务内显式完成。
  await adminDeleteContest(id)
  return ok({ message: '删除成功' })
})
