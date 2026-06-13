/**
 * 班级题目管理
 * - GET  /api/classes/[id]/problems  班级题目列表
 * - POST /api/classes/[id]/problems  添加题目到班级（从公共题库或新建）
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
  cloneProblemToClass,
  createNewClassProblem,
  getClassById,
  getCurrentClassMember,
  listClassProblems,
} from '@/lib/class/service'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const classDataResult = await getClassById(id)
  if (!classDataResult) throw404('班级不存在')
  const classData = classDataResult!
  const classIsPublic = classData.isPublic

  const member = await getCurrentClassMember(id, user.id)
  if (!classIsPublic && !member) throw403('无权访问该班级')

  const q = readQuery<{ page?: string; pageSize?: string; difficulty?: string; search?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  const result = await listClassProblems(id, {
    page,
    pageSize,
    difficulty: q.difficulty,
    search: q.search,
  })
  return ok(result)
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  await assertClassAdmin(id, user.id, '只有管理员可以添加题目')

  const body = await readJson<{
    type?: 'existing' | 'new'
    problemId?: string
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }>(req)

  if (body.type === 'existing') {
    if (!body.problemId) throw400('MISSING_FIELDS', '请提供题目ID')
    const createdResult = await cloneProblemToClass(body.problemId!, id, user.id)
    if (!createdResult) throw404('题目不存在')
    const created = createdResult!
    const createdId = created.id
    return ok({ id: createdId }, { status: 201 })
  } else if (body.type === 'new') {
    if (!body.title || !body.description) {
      throw400('MISSING_FIELDS', '请提供题目标题和描述')
    }
    const created = await createNewClassProblem(id, user.id, {
      title: body.title!,
      description: body.description!,
      difficulty: body.difficulty,
      tags: body.tags,
      timeLimit: body.timeLimit,
      memoryLimit: body.memoryLimit,
    })
    return ok({ id: created.id }, { status: 201 })
  } else {
    throw400('INVALID_TYPE', '无效的类型')
  }
})
