/**
 * /api/admin/contests - 管理员竞赛管理
 *
 * GET  竞赛列表
 * POST 创建竞赛
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { adminCreateContest, listAdminContests } from '@/lib/contest/service'

/**
 * GET /api/admin/contests - 获取竞赛列表（管理员）
 */
export const GET = withApi.admin(async () => {
  const data = await listAdminContests()
  return ok(data)
})

/**
 * POST /api/admin/contests - 创建竞赛（管理员）
 */
export const POST = withApi.admin(async (req, _ctx, { user }) => {
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
