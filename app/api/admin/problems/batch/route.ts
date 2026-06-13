/**
 * /api/admin/problems/batch - 批量题目操作（管理员）
 *
 * action: 'visibility' | 'difficulty' | 'delete'
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    action?: string
    problemIds?: string[]
    visibility?: string
    difficulty?: string
  }>(req)

  const { action, problemIds } = body

  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    throw400('INVALID_PROBLEM_IDS', 'problemIds 必须是非空数组')
  }

  // 校验所有 ID
  const invalidIds = problemIds!.filter((id) => !isObjectId(id))
  if (invalidIds.length > 0) {
    throw400('INVALID_IDS', `以下 ID 格式无效: ${invalidIds.slice(0, 3).join(', ')}`)
  }

  let result: any = { updatedCount: 0, deletedCount: 0 }

  switch (action) {
    case 'visibility': {
      const { visibility } = body
      if (!['public', 'private', 'contest'].includes(visibility!)) {
        throw400('INVALID_VISIBILITY', '无效的可见性')
      }
      const updateRes = await prisma.problem.updateMany({
        where: { id: { in: problemIds } },
        data: {
          visibility: visibility!,
          isPublic: visibility === 'public',
        },
      })
      result.updatedCount = updateRes.count
      break
    }

    case 'difficulty': {
      const { difficulty } = body
      if (!['简单', '中等', '困难'].includes(difficulty!)) {
        throw400('INVALID_DIFFICULTY', '无效的难度')
      }
      const updateRes = await prisma.problem.updateMany({
        where: { id: { in: problemIds } },
        data: { difficulty: difficulty! },
      })
      result.updatedCount = updateRes.count
      break
    }

    case 'delete': {
      // 显式删除关联数据
      await prisma.submission.deleteMany({
        where: { problemId: { in: problemIds } },
      })
      await prisma.solution.deleteMany({
        where: { problemId: { in: problemIds } },
      })
      await prisma.contestProblem.deleteMany({
        where: { problemId: { in: problemIds } },
      })
      await prisma.trainingProblem.deleteMany({
        where: { problemId: { in: problemIds } },
      })
      await prisma.favorite.deleteMany({
        where: { problemId: { in: problemIds } },
      })
      await prisma.testCase.deleteMany({
        where: { problemId: { in: problemIds } },
      })

      const deleteRes = await prisma.problem.deleteMany({
        where: { id: { in: problemIds } },
      })
      result.deletedCount = deleteRes.count
      break
    }

    default:
      throw400('INVALID_ACTION', '无效的操作类型')
  }

  return ok(result)
})
