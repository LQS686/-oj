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
  getClassProblem,
  updateClassProblemFields,
  deleteClassProblem,
} from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const problem = await getClassProblem(id, problemId)
  if (!problem) throw404('题目不存在')

  const classData = await prisma.class.findUnique({ where: { id } })
  if (!classData) throw404('班级不存在')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!classData!.isPublic && !member) throw403('无权访问该班级')

  const acRate =
    problem!.totalSubmit > 0
      ? Math.round((problem!.totalAccepted / problem!.totalSubmit) * 100)
      : 0

  return ok({
    id: problem!.id,
    title: problem!.title,
    description: problem!.description,
    difficulty: problem!.difficulty,
    tags: problem!.tags || [],
    timeLimit: problem!.timeLimit,
    memoryLimit: problem!.memoryLimit,
    testCases: problem!.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.output,
      isHidden: !tc.isSample,
    })),
    stats: {
      acCount: problem!.totalAccepted,
      totalSubmissions: problem!.totalSubmit,
      acRate,
    },
    createdBy: problem!.authorId,
    createdAt: problem!.createdAt,
    updatedAt: problem!.updatedAt,
  })
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('只有管理员可以编辑题目')
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId, classId: id },
  })
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

export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  const { id, problemId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('只有管理员可以删除题目')
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId, classId: id },
  })
  if (!problem) throw404('题目不存在')

  await deleteClassProblem(problemId)
  return ok({ message: '题目删除成功' })
})
