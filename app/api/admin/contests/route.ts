/**
 * /api/admin/contests - 管理员竞赛管理
 *
 * GET  竞赛列表
 * POST 创建竞赛
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { adminCreateContest, listAdminContests } from '@/lib/contest/service'

/**
 * GET /api/admin/contests - 获取竞赛列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }
  const data = await listAdminContests()
  return ok({ data })
})

/**
 * POST /api/admin/contests - 创建竞赛（管理员）
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    title?: string
    description?: string
    type?: string
    startTime?: string
    endTime?: string
    isPublic?: boolean
    password?: string
    problems?: string[]
  }>(req)
  const {
    title, description, type, startTime, endTime, isPublic, password, problems,
  } = body

  if (!title || !description || !startTime || !endTime || !type) {
    throw400('MISSING_FIELDS', '请填写所有必填字段')
  }

  const contest = await adminCreateContest({
    title: title!,
    description: description!,
    type: type!,
    startTime: startTime!,
    endTime: endTime!,
    isPublic, password, problems,
  }, user.id)

  return ok(contest)
})
