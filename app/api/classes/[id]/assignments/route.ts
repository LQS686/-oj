/**
 * 班级作业管理
 * - GET  /api/classes/[id]/assignments  作业列表（带统计）
 * - POST /api/classes/[id]/assignments  创建作业（仅管理员）
 */
import {
  withApi,
  ok,
  readJson,
  readQuery,
  throw400,
  throw403,
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  assertClassAdmin,
  getClassById,
  getCurrentClassMember,
  listClassAssignmentsWithStats,
  validateAssignmentProblems,
} from '@/lib/class/service'
import { createClassAssignment } from '@/lib/class/assignment'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看作业')

  const q = readQuery<{ page?: string; pageSize?: string; status?: 'ongoing' | 'ended' }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  const result = await listClassAssignmentsWithStats(id, {
    page,
    pageSize,
    status: q.status,
  })
  return ok(result)
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  await assertClassAdmin(id, user.id, '只有管理员可以创建作业')

  const body = await readJson<{
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    deadline?: string | Date
    problemIds?: string[]
  }>(req)

  // 兼容 deadline 和 endTime
  const finalEndTime = body.endTime || body.deadline
  if (!body.title || !finalEndTime || !body.problemIds || body.problemIds.length === 0) {
    throw400('MISSING_FIELDS', '请填写完整的作业信息')
  }

  // 检查班级是否存在
  const classData = await getClassById(id)
  if (!classData) throw404('班级不存在')

  // 验证题目是否存在并公开
  const valid = await validateAssignmentProblems(body.problemIds!)
  if (!valid) throw400('INVALID_PROBLEMS', '部分题目不存在或未公开')

  const now = new Date()
  const finalStartTime = body.startTime ? new Date(body.startTime) : now
  const finalEndDate = new Date(finalEndTime!)

  const assignment = await createClassAssignment({
    classId: id,
    title: body.title!,
    description: body.description || '',
    problemIds: body.problemIds!,
    startTime: finalStartTime,
    endTime: finalEndDate,
    createdBy: user.id,
  })

  return ok({ id: assignment.id }, { status: 201 })
})
