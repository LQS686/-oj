/**
 * /api/admin/problems/[id] - 管理员单个题目操作
 *
 * GET    题目详情
 * PATCH  更新题目
 * PUT    更新题目（同 PATCH）
 * DELETE 删除题目
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  getAdminProblemById,
  updateAdminProblem,
  deleteAdminProblem,
} from '@/lib/problem/service'

/**
 * GET /api/admin/problems/[id] - 获取题目详情（管理员）
 */
export const GET = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const problem = await getAdminProblemById(id)
  if (!problem) throw404('题目不存在')
  return ok(problem)
})

/**
 * PATCH /api/admin/problems/[id] - 更新题目（管理员）
 */
export const PATCH = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const body = await readJson<Record<string, any>>(req)
  return ok(await updateAdminProblem(id, body))
})

/**
 * PUT /api/admin/problems/[id] - 更新题目（管理员）
 */
export const PUT = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const body = await readJson<Record<string, any>>(req)
  return ok(await updateAdminProblem(id, body))
})

/**
 * DELETE /api/admin/problems/[id] - 删除题目（管理员）
 */
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  return ok(await deleteAdminProblem(id))
})
