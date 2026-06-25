/**
 * 班级单个题目管理
 * - GET    /api/classes/[id]/problems/[problemId]
 * - PUT    /api/classes/[id]/problems/[problemId]
 * - DELETE /api/classes/[id]/problems/[problemId]
 */
import {
  withApi,
  ok,
  readJson,
  throw400,
  throw403,
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  assertClassAdmin,
  deleteClassProblem,
  findClassProblem,
  getClassById,
  getClassProblem,
  getCurrentClassMember,
  updateClassProblemFields,
} from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const problem = await getClassProblem(id, problemId)
  if (!problem) throw404('题目不存在')
  const safeProblem = problem!

  const classData = await getClassById(id)
  if (!classData) throw404('班级不存在')
  const classIsPublic = classData!.isPublic

  const member = await getCurrentClassMember(id, user.id)
  if (!classIsPublic && !member) throw403('无权访问该班级')

  const acRate =
    safeProblem.totalSubmit > 0
      ? Math.round((safeProblem.totalAccepted / safeProblem.totalSubmit) * 100)
      : 0

  return ok({
    id: safeProblem.id,
    title: safeProblem.title,
    description: safeProblem.description,
    difficulty: safeProblem.difficulty,
    tags: safeProblem.tags || [],
    timeLimit: safeProblem.timeLimit,
    memoryLimit: safeProblem.memoryLimit,
    testCases: safeProblem.testCases.map((tc: any) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.output,
      isHidden: !tc.isSample,
    })),
    stats: {
      acCount: safeProblem.totalAccepted,
      totalSubmissions: safeProblem.totalSubmit,
      acRate,
    },
    createdBy: safeProblem.authorId,
    createdAt: safeProblem.createdAt,
    updatedAt: safeProblem.updatedAt,
  })
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  await assertClassAdmin(id, user.id, '只有管理员可以编辑题目')

  const problem = await findClassProblem(problemId, id)
  if (!problem) throw404('题目不存在')

  const body = await readJson<{
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }>(req)

  const updateData: any = {}
  if (body.title !== undefined) updateData.title = body.title
  if (body.description !== undefined) updateData.description = body.description
  if (body.difficulty !== undefined) updateData.difficulty = body.difficulty
  if (body.tags !== undefined) updateData.tags = body.tags
  if (body.timeLimit !== undefined) updateData.timeLimit = body.timeLimit
  if (body.memoryLimit !== undefined) updateData.memoryLimit = body.memoryLimit

  await updateClassProblemFields(problemId, updateData)
  return ok({ message: '题目更新成功' })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  await assertClassAdmin(id, user.id, '只有管理员可以删除题目')

  const problem = await findClassProblem(problemId, id)
  if (!problem) throw404('题目不存在')

  await deleteClassProblem(problemId)
  return ok({ message: '题目删除成功' })
})
