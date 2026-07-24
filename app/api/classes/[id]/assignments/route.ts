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
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  getClassById,
  listClassAssignmentsWithStats,
  validateAssignmentProblems,
} from '@/lib/class/service'
import { createClassAssignment } from '@/lib/class/assignment'

export const GET = withApi.classRole(
  ['owner', 'assistant', 'student'],
  async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const q = readQuery<{ page?: string; pageSize?: string; status?: 'upcoming' | 'active' | 'ongoing' | 'ended' }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  const result = await listClassAssignmentsWithStats(id, {
    page,
    pageSize,
    status: q.status,
  })
  return ok(result)
})

export const POST = withApi.classRole(['owner', 'assistant'], async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

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

  // === 输入校验 ===
  // title 长度校验：1-200 字符（trim 后）
  const titleTrimmed = body.title!.trim()
  if (titleTrimmed.length < 1 || titleTrimmed.length > 200) {
    throw400('INVALID_TITLE', '标题长度必须为 1-200 字符')
  }
  // description 长度校验：0-2000 字符（如果提供）
  if (body.description && body.description.length > 2000) {
    throw400('INVALID_DESCRIPTION', '描述长度不能超过 2000 字符')
  }
  // problemIds 数量校验：1-50 个
  if (body.problemIds!.length > 50) {
    throw400('INVALID_PROBLEM_COUNT', '题目数量必须为 1-50 个')
  }
  // problemIds 每个元素 ObjectId 格式校验
  for (const pid of body.problemIds!) {
    if (!isObjectId(pid)) {
      throw400('INVALID_PROBLEM_ID', `无效的题目 ID: ${pid}`)
    }
  }
  // 时间字符串有效性校验
  if (body.startTime && Number.isNaN(new Date(body.startTime).getTime())) {
    throw400('INVALID_DATE_FORMAT', '开始时间格式无效')
  }
  if (Number.isNaN(new Date(finalEndTime!).getTime())) {
    throw400('INVALID_DATE_FORMAT', '结束时间格式无效')
  }
  // startTime < endTime 校验（两者都提供时）
  if (
    body.startTime &&
    new Date(body.startTime).getTime() >= new Date(finalEndTime!).getTime()
  ) {
    throw400('INVALID_TIME_RANGE', '开始时间必须早于结束时间')
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
