/**
 * 班级题单管理
 * - GET  /api/classes/[id]/trainings  班级题单列表（仅成员可见）
 * - POST /api/classes/[id]/trainings  创建班级私有题单（仅 owner/assistant）
 *
 * 班级题单为 Training 表中 classId 不为空的记录：
 * - isPublic=false, status='published', classId=班级ID
 * - 仅班级成员可见，复用题单详情页 /training/[id]
 */
import {
  withApi,
  ok,
  readJson,
  readQuery,
  throw400,
  throw403,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  assertClassAdmin,
  getCurrentClassMember,
} from '@/lib/class/service'
import {
  listClassTrainings,
  createTrainingWithProblems,
  canManageClassTraining,
} from '@/lib/training/service'
import { toInt } from '@/lib/api/validation'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  // 仅班级成员可查看
  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看题单')

  const q = readQuery<{ page?: string; pageSize?: string; limit?: string }>(req)
  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit || q.pageSize, 'limit', 20)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  const data = await listClassTrainings(id, page, limit, user.id)
  return ok(data)
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  // 仅班级管理员（owner/assistant）可创建
  await assertClassAdmin(id, user.id, '只有班级管理员可以创建题单')

  const body = await readJson<{
    title: string
    description: string
    difficulty?: string
    tags?: string[]
    cover?: string
    problemIds?: string[]
  }>(req)

  if (!body.title || !body.description) {
    throw400('VALIDATION', '请填写题单标题和描述')
  }

  // 班级私有题单：isPublic=false + status='published' + classId=班级ID
  // 不暴露 categoryType/isRecommended 等公开属性
  const training = await createTrainingWithProblems({
    title: body.title,
    description: body.description,
    difficulty: body.difficulty ?? null,
    isPublic: false,
    status: 'published',
    isRecommended: false,
    authorId: user.id,
    tags: body.tags,
    cover: body.cover,
    problemIds: body.problemIds,
    classId: id,
  })

  return ok(training, { status: 201 })
})
