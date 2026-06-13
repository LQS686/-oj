/**
 * /api/admin/contests/[id] - 管理员单个竞赛操作
 *
 * GET    竞赛详情（含题目列表）
 * PATCH  更新竞赛
 * DELETE 删除竞赛
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  adminGetContestWithProblems,
  adminUpdateContest,
  adminDeleteContest,
  type AdminUpdateContestInput,
} from '@/lib/contest/service'

function ensureAdmin(user: { role: string }) {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
}

/**
 * GET /api/admin/contests/[id] - 获取单个竞赛详情（管理员）
 */
export const GET = withApi.auth(async (_req, ctx, { user }) => {
  ensureAdmin(user)
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const contest = await adminGetContestWithProblems(id)
  if (!contest) throw404('竞赛不存在')
  return ok({ data: contest })
})

/**
 * PATCH /api/admin/contests/[id] - 更新竞赛（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  ensureAdmin(user)
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const body = await readJson<AdminUpdateContestInput>(req)
  return ok(await adminUpdateContest(id, body))
})

/**
 * DELETE /api/admin/contests/[id] - 删除竞赛（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  ensureAdmin(user)
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // 删除竞赛（级联删除会处理关联数据，如 ContestProblem）
  // 但注意 Prisma MongoDB 不支持完全的数据库级联，需要 schema 里定义 onDelete: Cascade 或者手动删除
  // schema 中 ContestProblem 有 onDelete: Cascade 指向 Contest，所以 Prisma Client 会处理
  await adminDeleteContest(id)
  return ok({ message: '删除成功' })
})
