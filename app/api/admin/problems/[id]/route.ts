/**
 * /api/admin/problems/[id] - 管理员单个题目操作
 *
 * GET    题目详情
 * PATCH  更新题目
 * PUT    更新题目（同 PATCH）
 * DELETE 删除题目
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { redistributeTestScores } from '@/lib/problem/testcase'

/**
 * GET /api/admin/problems/[id] - 获取题目详情（管理员）
 */
export const GET = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: {
        orderBy: { orderIndex: 'asc' },
      },
      author: {
        select: {
          username: true,
          nickname: true,
        },
      },
    },
  })

  if (!problem) throw404('题目不存在')

  return ok(problem)
})

/**
 * PATCH /api/admin/problems/[id] - 更新题目（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  return handleUpdate(req, ctx, { user })
})

/**
 * PUT /api/admin/problems/[id] - 更新题目（管理员）
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  return handleUpdate(req, ctx, { user })
})

async function handleUpdate(
  req: any,
  ctx: any,
  _ctxAuth: { user: any },
) {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')

  const body = await readJson<Record<string, any>>(req)

  // 检查题目是否存在
  const existingProblem = await prisma.problem.findUnique({
    where: { id },
  })
  if (!existingProblem) throw404('题目不存在')

  // 如果更新题目编号，检查是否重复
  if (body.problemNumber && body.problemNumber !== existingProblem!.problemNumber) {
    const duplicate = await prisma.problem.findUnique({
      where: { problemNumber: body.problemNumber },
    })
    if (duplicate) {
      throw400('DUPLICATE_NUMBER', '题目编号已存在')
    }
  }

  // 准备更新数据
  const updateData: any = {}
  const allowedFields = [
    'problemNumber', 'title', 'description', 'input', 'output',
    'samples', 'hint', 'source', 'difficulty', 'tags',
    'timeLimit', 'memoryLimit', 'isPublic', 'visibility',
  ]

  allowedFields.forEach((field) => {
    if (field in body) {
      updateData[field] = body[field]
    }
  })

  // Sync visibility and isPublic if visibility is present
  if (updateData.visibility) {
    updateData.isPublic = updateData.visibility === 'public'
  } else if (updateData.isPublic !== undefined) {
    updateData.visibility = updateData.isPublic ? 'public' : 'private'
  }

  // 1. 更新题目基本信息
  await prisma.problem.update({
    where: { id },
    data: updateData,
  })

  // 2. 更新测试用例
  if (body.testCases && Array.isArray(body.testCases)) {
    // 删除旧的测试用例
    await prisma.testCase.deleteMany({
      where: { problemId: id },
    })

    // 创建新的测试用例
    if (body.testCases.length > 0) {
      await prisma.testCase.createMany({
        data: body.testCases.map((tc: any, idx: number) => ({
          problemId: id,
          input: tc.input || '',
          output: tc.output || '',
          isSample: tc.isSample || false,
          score: tc.score || 10,
          orderIndex: idx,
        })),
      })
    }
  }

  // 3. 如果测试用例有变化，重新分配分数
  if (body.testCases && Array.isArray(body.testCases) && body.testCases.length > 0) {
    await redistributeTestScores(id)
  }

  // 获取更新后的题目
  const updatedProblem = await prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: { orderBy: { orderIndex: 'asc' } },
    },
  })

  return ok({ data: updatedProblem, message: '题目更新成功' })
}

/**
 * DELETE /api/admin/problems/[id] - 删除题目（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')

  // 检查题目是否存在
  const problem = await prisma.problem.findUnique({
    where: { id },
  })
  if (!problem) throw404('题目不存在')

  // 显式删除相关数据，解决外键约束问题
  await prisma.submission.deleteMany({
    where: { problemId: id },
  })

  await prisma.solution.deleteMany({
    where: { problemId: id },
  })

  await prisma.contestProblem.deleteMany({
    where: { problemId: id },
  })

  await prisma.trainingProblem.deleteMany({
    where: { problemId: id },
  })

  await prisma.favorite.deleteMany({
    where: { problemId: id },
  })

  await prisma.testCase.deleteMany({
    where: { problemId: id },
  })

  // 删除题目
  await prisma.problem.delete({
    where: { id },
  })

  return ok({ message: '题目已删除' })
})
